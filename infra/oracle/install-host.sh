#!/usr/bin/env bash
# Run on a NEW Ubuntu 24.04 OCI VM, never on the Windows laptop.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo on the target VM.' >&2; exit 1; }
domain=${1:?Usage: sudo bash install-host.sh YOUR_SUBDOMAIN.duckdns.org}
[[ "$domain" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.duckdns\.org$ ]] || { echo 'Expected a DuckDNS subdomain.' >&2; exit 1; }
[[ ! -e /etc/tryggpuls/app.env ]] || { echo 'Host already configured. Use deploy-release.sh for updates.' >&2; exit 1; }
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo 'This installer requires Ubuntu 24.04.' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg xz-utils debian-keyring debian-archive-keyring apt-transport-https
install -d -m 0755 /usr/share/postgresql-common/pgdg
curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' "$VERSION_CODENAME" > /etc/apt/sources.list.d/pgdg.list
curl --fail --silent --show-error https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl --fail --silent --show-error https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
chmod 0644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y postgresql-18 postgresql-client-18 caddy
case "$(uname -m)" in aarch64) arch=arm64;; x86_64) arch=x64;; *) echo 'Unsupported CPU architecture.' >&2; exit 1;; esac
node_version=v24.22.0
download_dir=$(mktemp -d)
trap 'rm -rf -- "$download_dir"' EXIT
archive="node-${node_version}-linux-${arch}.tar.xz"
curl --fail --silent --show-error "https://nodejs.org/dist/${node_version}/${archive}" -o "$download_dir/$archive"
curl --fail --silent --show-error "https://nodejs.org/dist/${node_version}/SHASUMS256.txt" -o "$download_dir/SHASUMS256.txt"
(cd "$download_dir" && awk -v archive="$archive" '$2 == archive {print}' SHASUMS256.txt | sha256sum --check --status)
tar -xJf "$download_dir/$archive" --strip-components=1 -C /usr/local
id tryggpuls >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/tryggpuls --shell /usr/sbin/nologin tryggpuls
install -d -m 0750 -o root -g tryggpuls /etc/tryggpuls
install -d -m 0755 /opt/tryggpuls/releases
install -d -m 0700 -o tryggpuls -g tryggpuls /var/lib/tryggpuls/backups
if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='tryggpuls'" | grep -q 1; then
    echo 'An existing tryggpuls database role was found. Refusing to replace credentials.' >&2; exit 1
fi
db_password=$(/usr/local/bin/node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")
runuser -u postgres -- psql --set=ON_ERROR_STOP=1 --set=password="$db_password" <<'SQL'
CREATE ROLE tryggpuls LOGIN PASSWORD :'password';
CREATE DATABASE tryggpuls OWNER tryggpuls;
SQL
umask 077
cat > /etc/tryggpuls/app.env <<EOF
NODE_ENV=production
APP_ENV=production
HOST=127.0.0.1
PORT=3000
TRYGGPULS_LOAD_ENVFILE=false
PUBLIC_APP_URL=https://${domain}
DATABASE_URL=postgresql://tryggpuls:${db_password}@127.0.0.1:5432/tryggpuls
COMMUNITY_PUBLISHING_ENABLED=false
COMMUNITY_LAUNCH_APPROVED=false
MODERATION_STAFFED=false
NATIVE_PUSH_ENABLED=false
FAMILY_PREVIEW_MODE=false
EOF
unset db_password
chown root:tryggpuls /etc/tryggpuls/app.env
chmod 0640 /etc/tryggpuls/app.env
install -m 0644 "$source_dir/tryggpuls.service" "$source_dir/tryggpuls-backup.service" "$source_dir/tryggpuls-backup.timer" "$source_dir/tryggpuls-health.service" "$source_dir/tryggpuls-health.timer" /etc/systemd/system/
install -d -m 0755 /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=TRYGGPULS_DOMAIN=%s\n' "$domain" > /etc/systemd/system/caddy.service.d/tryggpuls.conf
install -m 0644 "$source_dir/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable postgresql
systemctl stop caddy
echo 'Host prepared. Restore and compare the database, deploy the release, configure backup.env, then test and enable the backup timer.'
echo 'Only ports 80/443 and SSH from your own IP should be permitted by OCI. Keep 3000 and 5432 private.'
