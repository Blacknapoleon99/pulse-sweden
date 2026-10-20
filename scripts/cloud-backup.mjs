import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export function backupRetention(objects, { prefix, keep, maxBytes }) {
  const managed = objects
    .filter(
      (item) =>
        item.Key?.startsWith(prefix) &&
        /^tryggpulse-\d{4}-\d{2}-\d{2}T[\dTZ.-]+\.dump\.enc$/.test(
          item.Key.slice(prefix.length),
        ),
    )
    .sort((a, b) => b.Key.localeCompare(a.Key));
  const retained = [],
    removed = [];
  let bytes = 0;
  for (const item of managed) {
    const size = Number(item.Size);
    if (!Number.isFinite(size) || size < 0)
      throw Error("Object size is invalid.");
    if (retained.length < keep && bytes + size <= maxBytes) {
      retained.push(item);
      bytes += size;
    } else removed.push(item);
  }
  if (managed.length && !retained.length)
    throw Error("Newest backup exceeds the storage budget.");
  if (managed.length && retained[0]?.Key !== managed[0].Key)
    throw Error("Storage policy must preserve the newest backup.");
  return { retained, removed, bytes };
}
async function runNode(args) {
  await new Promise((ok, bad) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("error", bad);
    child.on("close", (code) =>
      code === 0 ? ok() : bad(Error("Backup subprocess failed.")),
    );
  });
}
export async function cloudBackup(env = process.env) {
  for (const name of [
    "DATABASE_URL",
    "BACKUP_ENCRYPTION_KEY",
    "BACKUP_DIRECTORY",
    "BACKUP_S3_ENDPOINT",
    "BACKUP_S3_REGION",
    "BACKUP_S3_BUCKET",
    "BACKUP_S3_ACCESS_KEY_ID",
    "BACKUP_S3_SECRET_ACCESS_KEY",
  ])
    if (!env[name]) throw Error("Missing backup configuration.");
  const endpoint = new URL(env.BACKUP_S3_ENDPOINT);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    !endpoint.hostname.endsWith(".oraclecloud.com")
  )
    throw Error("Expected an HTTPS Oracle Object Storage endpoint.");
  const prefix = env.BACKUP_S3_PREFIX || "tryggpuls/",
    keep = Number(env.BACKUP_KEEP || 7),
    maxBytes = Number(env.BACKUP_MAX_BYTES || 2_147_483_648);
  if (
    !/^[a-zA-Z0-9/_-]+\/$/.test(prefix) ||
    !Number.isInteger(keep) ||
    keep < 1 ||
    keep > 30 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 10_737_418_240
  )
    throw Error("Invalid backup retention configuration.");
  const folder = resolve(env.BACKUP_DIRECTORY),
    script = join(
      dirname(fileURLToPath(import.meta.url)),
      "database-backup.mjs",
    );
  await runNode([script, "backup"]);
  const success = JSON.parse(
      await readFile(join(folder, "last-success.json"), "utf8"),
    ),
    archive = resolve(success.archive);
  if (dirname(archive) !== folder || !archive.endsWith(".dump.enc"))
    throw Error("Unexpected backup archive path.");
  await runNode([script, "verify", archive]);
  const size = (await stat(archive)).size;
  if (size > maxBytes)
    throw Error("Backup exceeds the configured object-storage budget.");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  const digest = hash.digest("hex");
  const client = new S3Client({
    region: env.BACKUP_S3_REGION,
    endpoint: endpoint.toString(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
      secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = env.BACKUP_S3_BUCKET,
    Key = prefix + archive.slice(folder.length + 1);
  const objects = [];
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    objects.push(...(page.Contents || []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  await client.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: createReadStream(archive),
      ContentLength: size,
      ContentType: "application/octet-stream",
      Metadata: { sha256: digest },
    }),
  );
  const head = await client.send(new HeadObjectCommand({ Bucket, Key }));
  if (head.ContentLength !== size || head.Metadata?.sha256 !== digest)
    throw Error(
      "Uploaded backup verification failed; old copies were retained.",
    );
  const policy = backupRetention(
    [...objects.filter((item) => item.Key !== Key), { Key, Size: size }],
    { prefix, keep, maxBytes },
  );
  for (const item of policy.removed)
    await client.send(new DeleteObjectCommand({ Bucket, Key: item.Key }));
  // Local copies are rotated only after a confirmed upload.
  const retainedNames = new Set(
    policy.retained.map((item) => item.Key.slice(prefix.length)),
  );
  for (const name of await readdir(folder))
    if (
      /^tryggpulse-[\dTZ.-]+\.dump\.enc$/.test(name) &&
      !retainedNames.has(name)
    )
      await unlink(join(folder, name));
  await writeFile(
    join(folder, "cloud-last-success.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        key: Key,
        sha256: digest,
        retained: policy.retained.length,
        bytes: policy.bytes,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    `Cloud backup uploaded and verified; ${policy.retained.length} copies, ${policy.bytes} bytes.`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  cloudBackup().catch((error) => {
    console.error(
      `Cloud backup failed (${error.name || "Error"}). Inspect database access, storage permissions and configured limits. Old backups remain unless rotation had already started.`,
    );
    process.exitCode = 1;
  });
