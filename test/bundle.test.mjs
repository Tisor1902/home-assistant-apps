import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createBundle, wrapperFiles } from "../scripts/export-local.mjs";

test("actual archive uses committed allowlisted files only and refuses overwrite", async t => {
  const temp = await mkdtemp(join(tmpdir(), "goon-bundle-test-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const core = join(temp, "core"), root = join(temp, "wrapper"), outputDirectory = join(temp, "output");
  await mkdir(join(core, "src"), { recursive: true });
  await mkdir(join(core, "data"));
  await mkdir(join(core, "secrets"));
  const source = "// committed synthetic application\n";
  await writeFile(join(core, "src/app.mjs"), source);
  await writeFile(join(core, "Dockerfile"), 'FROM public.invalid/example:1\nCMD ["node", "src/app.mjs"]\n');
  await writeFile(join(core, "package.json"), '{}\n');
  await writeFile(join(core, "pnpm-lock.yaml"), 'lockfileVersion: 9\n');
  for (const file of ["data/godo-sync.sqlite", "secrets/godo_password", ".env"]) {
    await writeFile(join(core, file), "synthetic-secret-must-not-be-bundled");
  }
  const git = args => execFileSync("git", ["-C", core, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "-q"]);
  git(["add", "."]);
  git(["-c", "user.name=Synthetic Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  const commit = git(["rev-parse", "HEAD"]).trim();
  await writeFile(join(core, "src/app.mjs"), "// dirty synthetic change must not be bundled\n");
  await writeFile(join(core, "src/untracked.mjs"), "// untracked must not be bundled\n");
  for (const path of [...wrapperFiles, "Dockerfile"]) {
    const destination = join(root, "goon_calendar_sync", path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(new URL(`../goon_calendar_sync/${path}`, import.meta.url), destination);
  }
  await writeFile(join(root, "core.lock.json"), JSON.stringify({ repository: "fixture", commit, image: "fixture" }));
  const result = await createBundle({ coreDirectory: core, outputDirectory, root });
  assert.equal((await stat(result.archive)).mode & 0o777, 0o600);
  assert.equal(result.sha256, createHash("sha256").update(await readFile(result.archive)).digest("hex"));
  const files = execFileSync("tar", ["-tzf", result.archive], { encoding: "utf8" }).split("\n");
  assert.ok(files.includes("goon_calendar_sync/src/app.mjs"));
  for (const fragment of ["secrets/", "data/", ".env", "untracked.mjs", ".git/"]) {
    assert.ok(!files.some(file => file.includes(fragment)), fragment);
  }
  assert.equal(execFileSync("tar", ["-xOf", result.archive, "goon_calendar_sync/src/app.mjs"], { encoding: "utf8" }), source);
  const provenance = JSON.parse(execFileSync("tar", ["-xOf", result.archive, "goon_calendar_sync/bundle-provenance.json"], { encoding: "utf8" }));
  assert.equal(provenance.core.commit, commit);
  for (const [path, hash] of Object.entries(provenance.files)) {
    const bytes = execFileSync("tar", ["-xOf", result.archive, `goon_calendar_sync/${path}`]);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  }
  const before = await readFile(result.archive);
  await assert.rejects(createBundle({ coreDirectory: core, outputDirectory, root }));
  assert.deepEqual(await readFile(result.archive), before);
});
