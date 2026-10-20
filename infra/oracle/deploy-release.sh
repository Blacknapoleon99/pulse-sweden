#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo on the target VM.' >&2; exit 1; }
archive=${1:?Usage: sudo bash deploy-release.sh release.tar.gz SHA256}
checksum=${2:?An explicit release SHA256 is required}
[[ "$checksum" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid SHA256.' >&2; exit 1; }
[[ -f /etc/tryggpuls/app.env ]] || { echo 'Install the host first.' >&2; exit 1; }
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
release_dir="/opt/tryggpuls/releases/$(date -u +%Y%m%dT%H%M%SZ)"
[[ ! -e "$release_dir" ]] || { echo 'Release destination exists.' >&2; exit 1; }
# A release is data, not shell input. Reject absolute paths, traversal and links.
tar -tzf "$archive" | awk '/^\// || /(^|\/)\.\.(\/|$)/ {bad=1} END {exit bad}'
if tar -tvzf "$archive" | awk '$1 ~ /^[lh]/ {found=1} END {exit !found}'; then echo 'Links in release archives are forbidden.' >&2; exit 1; fi
install -d -m 0755 "$release_dir"
tar -xzf "$archive" --no-same-owner --no-same-permissions -C "$release_dir"
chown -R root:tryggpuls "$release_dir"
chmod -R u=rwX,g=rX,o=rX "$release_dir"
(cd "$release_dir" && npm ci --omit=dev --no-audit --no-fund)
previous=$(readlink -f /opt/tryggpuls/current || true)
systemctl stop tryggpuls.service || true
# Migrations run only after the old process (including background writers) stops.
if ! (cd "$release_dir" && runuser -u tryggpuls -- /usr/local/bin/node --env-file=/etc/tryggpuls/app.env scripts/migrate.mjs); then
    [[ -z "$previous" ]] || systemctl start tryggpuls.service
    echo 'Migration failed. Previous release restarted; inspect before retry.' >&2; exit 1
fi
ln -s "$release_dir" /opt/tryggpuls/current.next
mv -Tf /opt/tryggpuls/current.next /opt/tryggpuls/current
systemctl enable --now tryggpuls.service
healthy=false
for attempt in $(seq 1 30); do
    if curl --fail --silent http://127.0.0.1:3000/api/ready >/dev/null; then healthy=true; break; fi
    sleep 2
done
if [[ "$healthy" != true ]]; then
    systemctl stop tryggpuls.service
    if [[ -n "$previous" ]]; then ln -s "$previous" /opt/tryggpuls/current.rollback; mv -Tf /opt/tryggpuls/current.rollback /opt/tryggpuls/current; systemctl start tryggpuls.service; fi
    echo 'Readiness failed. Previous code restored if available. Review migration compatibility before rollback of data.' >&2; exit 1
fi
systemctl enable --now caddy
systemctl reload caddy
echo 'API ready locally. Verify public HTTPS and account/family isolation before switching clients.'
