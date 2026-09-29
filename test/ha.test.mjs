import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, stat, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateOptions, parseOptions, assertActive, environmentFor } from "../goon_calendar_sync/ha/options.mjs";
import { snapshotDatabase, importDatabase } from "../goon_calendar_sync/ha/database.mjs";
import { prepare } from "../goon_calendar_sync/ha/bootstrap.mjs";
import { allowedCorePath, bundledDockerfile } from "../scripts/export-local.mjs";

const valid = {
  godo_username: "synthetic-test-user", godo_password: "synthetic-source-password",
  app_password: "synthetic-web-password", active_instance: true,
};
const text = path => readFile(new URL(path, import.meta.url), "utf8");

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "goon-ha-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function database(path, { wal = false } = {}) {
  const db = new DatabaseSync(path);
  if (wal) db.exec("PRAGMA journal_mode=WAL");
  for (const name of ["baseline_events", "changes", "private_settings", "calendar_targets", "calendar_event_links"]) {
    db.exec(`CREATE TABLE ${name} (id INTEGER PRIMARY KEY, value TEXT)`);
  }
  db.prepare("INSERT INTO private_settings(value) VALUES (?)").run("synthetic-token-never-print");
  return db;
}

test("HA defaults: amd64, manual startup, cold backup, auth, least privilege", async () => {
  const config = JSON.parse(await text("../goon_calendar_sync/config.json"));
  assert.deepEqual(config.arch, ["amd64"]);
  assert.equal(config.boot, "manual");
  assert.equal(config.backup, "cold");
  assert.equal(config.tmpfs, true);
  assert.equal(config.apparmor, true);
  assert.equal(config.options.active_instance, false);
  assert.equal(config.options.automatic_check_interval_minutes, 720);
  assert.deepEqual(config.map, [{ type: "addon_config", read_only: true }]);
  assert.equal(config.image, "ghcr.io/tisor1902/goon-calendar-sync-ha");
  for (const forbidden of ["privileged", "full_access", "host_network", "host_pid", "host_ipc", "docker_api", "hassio_api", "homeassistant_api", "ingress"]) {
    assert.equal(config[forbidden], undefined, forbidden);
  }
  const translations = JSON.parse(await text("../goon_calendar_sync/translations/de.json"));
  assert.deepEqual(Object.keys(config.options).sort(), Object.keys(config.schema).sort());
  assert.deepEqual(Object.keys(config.schema).sort(), Object.keys(translations.configuration).sort());
});

test("wrapper pins exactly the recorded core commit", async () => {
  const lock = JSON.parse(await text("../core.lock.json"));
  const dockerfile = await text("../goon_calendar_sync/Dockerfile");
  assert.match(lock.commit, /^[a-f0-9]{40}$/);
  assert.equal(lock.image, `ghcr.io/tisor1902/goon-calendar-sync:sha-${lock.commit.slice(0, 7)}`);
  assert.match(lock.sourceSha256, /^[a-f0-9]{64}$/);
  assert.ok(dockerfile.includes(`ADD ${lock.sourceArchive} /tmp/goon-source.tar.gz`));
  assert.ok(dockerfile.includes(`${lock.sourceSha256}  /tmp/goon-source.tar.gz`));
  assert.ok(dockerfile.includes(`org.opencontainers.image.revision="${lock.commit}"`));
  assert.ok(!dockerfile.includes('FROM ${GOON_IMAGE}'));
  const manifest = JSON.parse(await text("../goon_calendar_sync/config.json"));
  assert.ok(dockerfile.includes(`ARG BUILD_VERSION=${manifest.version}`));
});

test("options map valid defaults, never allow source or authentication overrides", () => {
  const options = validateOptions({ ...valid, APP_AUTH_DISABLED: "true", GODO_BASE_URL: "http://untrusted.invalid" });
  const environment = environmentFor(options, { dataDirectory: "/data", secretFiles: { username: "/tmp/u", password: "/tmp/p", appPassword: "/tmp/a" } });
  assert.equal(environment.APP_AUTH_DISABLED, "false");
  assert.equal(environment.GODO_BASE_URL, "https://goon.asb-bw.de");
  assert.equal(environment.AUTOMATIC_CHECK_INTERVAL_MINUTES, "720");
  assert.equal(environment.BROWSER_HEADLESS, "true");
  for (const secret of [valid.godo_password, valid.app_password]) assert.ok(!JSON.stringify(environment).includes(secret));
});

for (const [field, bad] of [
  ["godo_username", ""], ["godo_password", "x\ny"], ["app_password", "short"], ["app_username", "a:b"],
  ["timezone", "Invalid/Synthetic"], ["active_instance", "true"], ["automatic_check_enabled", 1],
  ["automatic_check_interval_minutes", 14], ["automatic_check_interval_minutes", 10081],
  ["automatic_check_interval_minutes", 720.5], ["automatic_past_months", -1], ["automatic_future_months", 25],
  ["public_base_url", "http://192.168.1.2:8098"], ["public_base_url", "https://host.invalid/subpath"],
  ["public_base_url", "https://user:synthetic-secret@host.invalid"], ["public_base_url", "https://host.invalid/?code=synthetic"],
]) {
  test(`reject invalid ${field}: ${typeof bad}`, () => {
    assert.throws(() => validateOptions({ ...valid, [field]: bad }), error => error.message.startsWith(field + ":") && !error.message.includes("synthetic-secret"));
  });
}

test("HTTPS origin and loopback OAuth configurations work", () => {
  for (const url of ["https://calendar.example.test/", "http://localhost:8098", "http://127.0.0.1:8098", "http://[::1]:8098"]) {
    assert.equal(validateOptions({ ...valid, public_base_url: url }).public_base_url, new URL(url).origin);
  }
});
test("malformed JSON and rejected values never disclose credentials", () => {
  for (const input of ['{"godo_password":"synthetic-secret"', "null", "[]", "x".repeat(70000)]) {
    assert.throws(() => parseOptions(input), error => !error.message.includes("synthetic-secret"));
  }
  assert.throws(() => assertActive({ active_instance: false }), /Start gesperrt/);
});

test("inactive instance creates neither database nor temporary secrets", async t => {
  const directory = await fixture(t);
  await writeFile(join(directory, "options.json"), JSON.stringify({ ...valid, active_instance: false, import_existing_database: true }));
  await assert.rejects(prepare({ dataDirectory: directory, configDirectory: directory, temporaryDirectory: directory }), /Start gesperrt/);
  assert.deepEqual(await readdir(directory), ["options.json"]);
});
test("secrets use private temporary files, auth is on and cleanup removes only owned files", async t => {
  const directory = await fixture(t);
  await writeFile(join(directory, "options.json"), JSON.stringify(valid));
  const result = await prepare({ dataDirectory: directory, configDirectory: directory, temporaryDirectory: directory });
  assert.equal(result.imported, "disabled");
  assert.equal(result.environment.APP_AUTH_DISABLED, "false");
  const filename = result.environment.APP_PASSWORD_FILE;
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  assert.equal(await readFile(filename, "utf8"), valid.app_password);
  await result.cleanup();
  assert.deepEqual(await readdir(directory), ["options.json"]);
});

test("SQLite backup includes committed WAL data and produces standalone private snapshot", async t => {
  const directory = await fixture(t);
  const source = join(directory, "source.sqlite"), destination = join(directory, "snapshot.sqlite");
  const db = database(source, { wal: true });
  t.after(() => db.close());
  await snapshotDatabase(source, destination);
  const snapshot = new DatabaseSync(destination, { readOnly: true });
  try {
    assert.equal(snapshot.prepare("SELECT COUNT(*) AS n FROM private_settings").get().n, 1);
    assert.equal(snapshot.prepare("PRAGMA journal_mode").get().journal_mode, "delete");
  } finally { snapshot.close(); }
  assert.equal((await stat(destination)).mode & 0o777, 0o600);
  assert.ok(!(await readdir(directory)).includes("snapshot.sqlite-wal"));
});

test("database import is idempotent and preserves all existing data on restart", async t => {
  const directory = await fixture(t);
  const source = join(directory, "source.sqlite"), destination = join(directory, "target", "godo-sync.sqlite");
  database(source).close();
  const args = { requested: true, source, destination };
  assert.equal(await importDatabase(args), "imported");
  const before = await readFile(destination);
  await rm(source);
  assert.equal(await importDatabase(args), "already-imported");
  assert.deepEqual(await readFile(destination), before);
});
test("import refuses any existing database rather than overwrite it", async t => {
  const directory = await fixture(t);
  const source = join(directory, "source.sqlite"), destination = join(directory, "target.sqlite");
  database(source).close();
  await writeFile(destination, "keep-me");
  await assert.rejects(importDatabase({ requested: true, source, destination }), /niemals überschrieben/);
  assert.equal(await readFile(destination, "utf8"), "keep-me");
});
test("import refuses source WAL files, orphaned target sidecars and missing-marker ambiguity", async t => {
  const directory = await fixture(t);
  const source = join(directory, "source.sqlite"), destination = join(directory, "target.sqlite");
  database(source).close();
  await writeFile(source + "-wal", "synthetic");
  await assert.rejects(importDatabase({ requested: true, source, destination }), /ohne WAL/);
  await rm(source + "-wal");
  await writeFile(destination + "-wal", "keep-me");
  await assert.rejects(importDatabase({ requested: true, source, destination }), /niemals überschrieben/);
  assert.equal(await readFile(destination + "-wal", "utf8"), "keep-me");
});
test("disabled import does not read or copy a source", async () => {
  assert.equal(await importDatabase({ requested: false, source: "/missing", destination: "/missing" }), "disabled");
});
test("corrupt, unrelated and symbolic-link databases cannot be imported", async t => {
  const directory = await fixture(t);
  const source = join(directory, "invalid.sqlite"), destination = join(directory, "target.sqlite");
  await writeFile(source, "not-sqlite");
  await assert.rejects(snapshotDatabase(source, destination));
  await rm(source);
  new DatabaseSync(source).close();
  await assert.rejects(snapshotDatabase(source, destination), /keine unterstützte/);
  await symlink(source, join(directory, "link.sqlite"));
  await assert.rejects(snapshotDatabase(join(directory, "link.sqlite"), destination));
  assert.ok(!(await readdir(directory)).includes("target.sqlite"));
});

test("bundle allowlist excludes databases, credentials, git history and path traversal", () => {
  for (const path of ["data/godo-sync.sqlite", "secrets/godo_password", ".env", ".git/config", "src/../secrets.mjs", "src/options.json", "src/.hidden.mjs", "test/x.mjs", "README.md"]) {
    assert.equal(allowedCorePath(path), false, path);
  }
  for (const path of ["src/app.mjs", "src/providers/google.mjs", "package.json", "pnpm-lock.yaml", "Dockerfile"]) assert.equal(allowedCorePath(path), true);
});
test("local bundle builds exact core source, without private registry or GitHub credentials", async () => {
  const wrapper = await text("../goon_calendar_sync/Dockerfile");
  const output = bundledDockerfile('FROM public.invalid/pinned:1\nCMD ["node", "src/app.mjs"]\n', wrapper);
  assert.ok(output.startsWith("FROM public.invalid/pinned:1"));
  assert.ok(!output.includes("FROM ${GOON_IMAGE}"));
  assert.ok(!output.includes("ghcr.io/tisor1902/goon-calendar-sync"));
  assert.ok(output.trim().endsWith('CMD ["node", "/app/ha/entrypoint.mjs"]'));
});
