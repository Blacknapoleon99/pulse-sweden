import { readFile, writeFile, statfs } from "node:fs/promises";
import { join, resolve } from "node:path";
const state = resolve(
  process.env.TRYGGPULS_STATE_DIRECTORY || "/var/lib/tryggpuls",
);
const response = await fetch("http://127.0.0.1:3000/api/ready", {
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok)
  throw Error("API readiness failed. Inspect tryggpuls.service.");
const disk = await statfs(state);
if (disk.bavail * disk.bsize < 1_073_741_824)
  throw Error("Less than 1 GiB of disk space remains.");
const success = JSON.parse(
  await readFile(join(state, "backups", "cloud-last-success.json"), "utf8"),
);
if (
  !Number.isFinite(Date.parse(success.at)) ||
  Date.now() - Date.parse(success.at) > 36 * 3_600_000
)
  throw Error(
    "Cloud backup is missing or older than 36 hours. Inspect tryggpuls-backup.service.",
  );
await writeFile(
  join(state, "health-last-success.json"),
  JSON.stringify(
    { at: new Date().toISOString(), backupAt: success.at },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log("API, free disk space and cloud backup are healthy.");
