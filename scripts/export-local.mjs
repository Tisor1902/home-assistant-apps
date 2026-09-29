import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, link, rm, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const wrapperFiles = [
  "config.json", ".dockerignore", "README.md", "DOCS.md", "CHANGELOG.md", "translations/de.json",
  "ha/options.mjs", "ha/database.mjs", "ha/bootstrap.mjs", "ha/entrypoint.mjs",
];

export function allowedCorePath(path) {
  if (["Dockerfile", "package.json", "pnpm-lock.yaml"].includes(path)) return true;
  return /^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mjs$/.test(path);
}

export function bundledDockerfile(core, wrapper) {
  const start = wrapper.indexOf("ARG BUILD_VERSION=");
  if (start < 0 || !core.includes('CMD ["node", "src/app.mjs"]')) throw new Error("Unsupported Dockerfile structure");
  return `${core.trim()}\n\n# Home Assistant packaging; core source remains maintained in its own repository.\n${wrapper.slice(start)}`;
}

export async function createBundle({ coreDirectory, outputDirectory = join(projectRoot, "dist"), root = projectRoot }) {
  const lock = JSON.parse(await readFile(join(root, "core.lock.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(root, "goon_calendar_sync/config.json"), "utf8"));
  if (!/^[a-f0-9]{40}$/.test(lock.commit) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Invalid release metadata");
  const git = args => execFileSync("git", ["-C", coreDirectory, ...args], { maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const tree = git(["ls-tree", "-r", lock.commit]).toString().trim().split("\n");
  const selected = tree.map(line => /^(\d+) blob ([a-f0-9]+)\t(.+)$/.exec(line))
    .filter(match => match && allowedCorePath(match[3]));
  for (const required of ["Dockerfile", "package.json", "pnpm-lock.yaml", "src/app.mjs"]) {
    if (!selected.some(match => match[3] === required)) throw new Error("Missing required core file");
  }
  if (selected.some(match => !["100644", "100755"].includes(match[1]))) throw new Error("Refusing symlinks in bundle");
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(outputDirectory, ".goon-build-"));
  const app = join(directory, "goon_calendar_sync");
  const hashes = {};
  async function put(path, bytes) {
    await mkdir(dirname(join(app, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(app, path), bytes, { mode: 0o600, flag: "wx" });
    hashes[path] = createHash("sha256").update(bytes).digest("hex");
  }
  try {
    for (const [, , blob, path] of selected) {
      if (path !== "Dockerfile") await put(path, git(["cat-file", "blob", blob]));
    }
    for (const path of wrapperFiles) await put(path, await readFile(join(root, "goon_calendar_sync", path)));
    const coreDockerfile = git(["show", `${lock.commit}:Dockerfile`]).toString();
    const wrapperDockerfile = await readFile(join(root, "goon_calendar_sync/Dockerfile"), "utf8");
    await put("Dockerfile", bundledDockerfile(coreDockerfile, wrapperDockerfile));
    await put("bundle-provenance.json", JSON.stringify({
      format: 1, version: manifest.version, core: lock,
      generatedAt: new Date().toISOString(), files: { ...hashes },
      note: "Only allowlisted committed core source and HA wrapper. No user data, credentials or Git history.",
    }, null, 2) + "\n");
    const filename = `goon-ha-local-${manifest.version}-${lock.commit.slice(0, 7)}.tar.gz`;
    const temporary = join(directory, filename);
    execFileSync("tar", ["--owner=0", "--group=0", "--numeric-owner", "-czf", temporary, "-C", directory, "goon_calendar_sync"], { stdio: ["ignore", "pipe", "pipe"] });
    await chmod(temporary, 0o600);
    const archive = join(outputDirectory, filename);
    await link(temporary, archive);
    const sha256 = createHash("sha256").update(await readFile(archive)).digest("hex");
    await writeFile(`${archive}.sha256`, `${sha256}  ${filename}\n`, { mode: 0o600, flag: "wx" });
    return { archive, sha256, fileCount: Object.keys(hashes).length, coreCommit: lock.commit };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [coreDirectory, outputDirectory, ...extra] = process.argv.slice(2);
  if (!coreDirectory || extra.length) {
    process.stderr.write("Aufruf: node scripts/export-local.mjs CORE-REPO [AUSGABEVERZEICHNIS]\n");
    process.exitCode = 1;
  } else {
    try {
      const result = await createBundle({ coreDirectory: resolve(coreDirectory), outputDirectory: outputDirectory && resolve(outputDirectory) });
      process.stdout.write(JSON.stringify(result) + "\n");
    } catch {
      process.stderr.write("Paket konnte nicht erstellt werden. Fixierten Core-Commit, Dateirechte und noch nicht vorhandenes Ausgabepaket prüfen.\n");
      process.exitCode = 1;
    }
  }
}
