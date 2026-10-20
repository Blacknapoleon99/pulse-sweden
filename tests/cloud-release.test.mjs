import test from "node:test";
import assert from "node:assert/strict";
import { releasePathAllowed } from "../scripts/package-cloud-release.mjs";
import { backupRetention } from "../scripts/cloud-backup.mjs";
test("cloud release contains runtime and installation files, never local credentials or private backups", () => {
  for (const path of [
    "server.mjs",
    "package.json",
    "migrations/001-community.sql",
    "vendor/leaflet/leaflet.js",
    "data/uso_2025_geojson.zip",
    "infra/oracle/install-host.sh",
  ])
    assert.equal(releasePathAllowed(path), true, path);
  for (const path of [
    ".env.local",
    "mobile/.env",
    "infra/oracle/backup.env.example",
    "assets/.env",
    "assets/credentials.json",
    "assets/backup.dump.enc",
    "tmp/credentials.json",
    "backups/last-success.json",
    "node_modules/pg/index.js",
  ])
    assert.equal(releasePathAllowed(path), false, path);
});
const object = (date, size) => ({
  Key: `tryggpuls/tryggpulse-2026-10-${date}T02-15-00.000Z.dump.enc`,
  Size: size,
});
test("rotation preserves newest backups within budget and ignores other objects", () => {
  const objects = [
    object("12", 40),
    object("13", 40),
    object("14", 40),
    { Key: "other/private-file", Size: 100 },
  ];
  const result = backupRetention(objects, {
    prefix: "tryggpuls/",
    keep: 7,
    maxBytes: 80,
  });
  assert.deepEqual(
    result.retained.map((item) => item.Key),
    [object("14", 40).Key, object("13", 40).Key],
  );
  assert.deepEqual(result.removed, [object("12", 40)]);
});
test("rotation refuses to discard an oversized newest backup or accept unknown object sizes", () => {
  assert.throws(() =>
    backupRetention([object("14", 100), object("13", 10)], {
      prefix: "tryggpuls/",
      keep: 7,
      maxBytes: 80,
    }),
  );
  assert.throws(() =>
    backupRetention([object("14", NaN)], {
      prefix: "tryggpuls/",
      keep: 7,
      maxBytes: 80,
    }),
  );
});
