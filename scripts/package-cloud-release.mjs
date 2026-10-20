import {
  readdir,
  mkdir,
  readFile,
  writeFile,
  mkdtemp,
  cp,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function releasePathAllowed(path) {
  const name = path.replaceAll("\\", "/");
  if (
    name
      .split("/")
      .some(
        (part) =>
          part.startsWith(".") ||
          part === "node_modules" ||
          part === "tmp" ||
          part === "backups",
      )
  )
    return false;
  if (!name.includes("/"))
    return (
      /\.(mjs|js|html|css|webmanifest)$/.test(name) ||
      ["package.json", "package-lock.json"].includes(name)
    );
  if (/^infra\/oracle\//.test(name))
    return (
      /\.(sh|service|timer)$/.test(name) || name === "infra/oracle/Caddyfile"
    );
  if (/^scripts\//.test(name)) return name.endsWith(".mjs");
  if (/^migrations\//.test(name)) return name.endsWith(".sql");
  if (/^assets\//.test(name))
    return /\.(png|jpg|jpeg|webp|svg|mp4|woff2?|ttf)$/.test(name);
  if (/^vendor\//.test(name))
    return /\.(js|css|txt|md)$/.test(name) || /\/LICENSE$/.test(name);
  if (name === "data/uso_2025_geojson.zip") return true;
  return false;
}
export async function packageRelease(directory = root, output) {
  const destination = resolve(
    output ||
      join(
        process.env.LOCALAPPDATA || process.env.TMPDIR || "/tmp",
        "TryggPulse",
        "releases",
      ),
  );
  if (
    destination === resolve(directory) ||
    destination.startsWith(resolve(directory) + "/") ||
    destination.startsWith(resolve(directory) + "\\")
  )
    throw Error("Release artifacts must be outside the repository.");
  await mkdir(destination, { recursive: true });
  const staging = await mkdtemp(join(destination, "package-")),
    files = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (
        entry.name.startsWith(".") ||
        [
          "node_modules",
          "mobile",
          "opening",
          "tmp",
          "docs",
          "tests",
          "backups",
        ].includes(entry.name)
      )
        continue;
      const path = join(folder, entry.name),
        name = relative(directory, path).replaceAll("\\", "/");
      if (entry.isSymbolicLink())
        throw Error("Release must not contain symbolic links.");
      if (entry.isDirectory()) {
        if (/^(vendor|assets|data|scripts|migrations|infra)(\/|$)/.test(name))
          await walk(path);
      } else if (releasePathAllowed(name)) {
        const target = join(staging, name);
        await mkdir(dirname(target), { recursive: true });
        await cp(path, target);
        files.push(name);
      }
    }
  }
  await walk(resolve(directory));
  for (const required of [
    "server.mjs",
    "package.json",
    "package-lock.json",
    "scripts/migrate.mjs",
    "infra/oracle/tryggpuls.service",
  ])
    if (!files.includes(required))
      throw Error("Release is missing " + required);
  const version = new Date().toISOString().replaceAll(":", "-"),
    manifest = { createdAt: new Date().toISOString(), files: files.sort() };
  await writeFile(
    join(staging, "release-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  const archive = join(destination, `tryggpuls-${version}.tar.gz`),
    tar = spawnSync("tar", ["-czf", archive, "-C", staging, "."], {
      stdio: "inherit",
    });
  if (tar.status !== 0) throw Error("Release archive creation failed.");
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await writeFile(archive + ".sha256", digest + "\n");
  console.log(JSON.stringify({ archive, sha256: digest, files: files.length }));
  return { archive, sha256: digest };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await packageRelease(root, process.argv[2]);
