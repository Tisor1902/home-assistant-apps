import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { get as httpsGet } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateOptions, environmentFor } from "../goon_calendar_sync/ha/options.mjs";
import { pairingKey, createIdentity, identityPublicKey, PinnedAgent } from "../goon_calendar_sync/ha/login-transport.mjs";
import { startLoginBridge } from "../goon_calendar_sync/ha/login-bridge.mjs";
import { browserOptions } from "../goon_google_login/ha/options.mjs";
import { prepareBrowser } from "../goon_google_login/ha/prepare.mjs";
import { startBrowserProxy } from "../goon_google_login/ha/proxy.mjs";

const key = () => randomBytes(32).toString("hex");
const coreInput = { godo_username: "synthetic", godo_password: "synthetic-source-password", app_password: "x" };
const input = extra => ({ pairing_key: key(), browser_password: "x", browser_origin: "https://ha.test.invalid:3081", ...extra });
const text = path => readFile(new URL(path, import.meta.url), "utf8");
const get = (port, options = {}) => new Promise((resolve, reject) => {
  const request = httpsGet({ host: "127.0.0.1", port, path: "/private", ...options }, response => { response.resume(); resolve(response.statusCode); });
  request.on("error", reject);
});

test("HA browser opt-in keeps old defaults, requires a pairing key and never exports it", () => {
  const direct = validateOptions(coreInput);
  assert.equal(direct.google_login_browser_enabled, false);
  assert.equal(environmentFor(direct, { secretFiles: {} }).GOOGLE_LOGIN_MODE, "direct");
  assert.throws(() => validateOptions({ ...coreInput, google_login_browser_enabled: true }), /google_login_pairing_key/);
  const secret = key();
  const enabled = validateOptions({ ...coreInput, google_login_browser_enabled: true, google_login_pairing_key: secret,
    google_login_browser_url: "https://ha.test.invalid:3081" });
  const env = environmentFor(enabled, { secretFiles: {} });
  assert.equal(env.GOOGLE_LOGIN_MODE, "server_browser"); assert.equal(env.GOOGLE_LOGIN_BROWSER_URL, "https://ha.test.invalid:3081");
  assert.ok(!JSON.stringify(env).includes(secret));
  for (const value of ["http://ha.test.invalid", "https://user:synthetic-hidden@ha.test.invalid", "https://ha.test.invalid/path"]) {
    assert.throws(() => validateOptions({ ...coreInput, google_login_browser_url: value }), error => !error.message.includes("synthetic-hidden"));
  }
});

test("browser validates its target, origin, password and key; unsafe overrides are ignored", () => {
  const options = browserOptions(JSON.stringify(input({ GODO_BASE_URL: "https://untrusted.invalid", PASSWORD: "override" })));
  assert.equal(options.targetHost, "8eef53e8-goon-calendar-sync"); assert.equal(options.password, "x");
  assert.equal(browserOptions(JSON.stringify(input({ goon_app_slug: "local_goon_calendar_sync" }))).targetHost, "local-goon-calendar-sync");
  for (const extra of [{ pairing_key: "short" }, { browser_password: "" }, { browser_password: "synthetic-hidden\n" },
    { browser_username: "$(synthetic-hidden)" }, { browser_origin: "http://ha.test.invalid" }, { browser_origin: "https://u:synthetic-hidden@ha.test.invalid" },
    { goon_app_slug: "example.invalid" }, { session_minutes: 4 }, { session_minutes: 121 }, { timezone: "invalid/synthetic-hidden" }]) {
    assert.throws(() => browserOptions(JSON.stringify(input(extra))), error => !error.message.includes("synthetic-hidden"));
  }
  for (const raw of ["null", "[]", "invalid", "x".repeat(70_000)]) assert.throws(() => browserOptions(raw));
});

test("private mTLS roles are deterministic, separated and do not use application passwords", () => {
  const secret = key();
  assert.deepEqual(identityPublicKey(secret, "app"), identityPublicKey(secret.toUpperCase(), "app"));
  assert.notDeepEqual(identityPublicKey(secret, "app"), identityPublicKey(secret, "browser"));
  for (const invalid of ["x", "0".repeat(63), "g".repeat(64), null]) assert.throws(() => pairingKey(invalid));
});

test("paired TLS bridge preserves requests/cookies and rejects unpaired clients and a wrong server pin", async t => {
  let hits = 0;
  const backend = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    hits++;
    response.writeHead(200, { "content-type": "application/json", "set-cookie": ["synthetic=one; HttpOnly", "synthetic2=two; HttpOnly"] });
    response.end(JSON.stringify({ headers: request.headers, url: request.url, body, peer: request.socket.remoteAddress }));
  });
  await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
  let bridge, proxy;
  t.after(async () => { await proxy?.close(); await bridge?.close(); backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve)); });
  const secret = key(), identity = await createIdentity(secret, "browser");
  bridge = await startLoginBridge({ pairingKey: secret, host: "127.0.0.1", port: 0, backendPort: backend.address().port });
  const port = bridge.server.address().port;
  proxy = await startBrowserProxy({ identity, expected: identityPublicKey(secret, "app"), targetHost: "127.0.0.1", port: 0, bridgePort: port });
  const response = await fetch(`http://127.0.0.1:${proxy.server.address().port}/oauth/google/callback?state=synthetic`, {
    method: "POST", headers: { "content-type": "application/json", cookie: "synthetic-cookie", origin: "http://127.0.0.1:8080", "x-forwarded-host": "evil.invalid", forwarded: "for=evil.invalid" },
    body: JSON.stringify({ synthetic: true }),
  });
  assert.equal(response.status, 200); assert.equal(response.headers.getSetCookie().length, 2);
  const result = await response.json();
  assert.equal(result.headers.host, `127.0.0.1:${backend.address().port}`); assert.equal(result.headers.origin, "http://127.0.0.1:8080");
  assert.equal(result.headers.cookie, "synthetic-cookie"); assert.equal(result.headers.forwarded, undefined); assert.equal(result.headers["x-forwarded-host"], undefined);
  assert.equal(result.body, JSON.stringify({ synthetic: true })); assert.equal(result.url, "/oauth/google/callback?state=synthetic"); assert.equal(result.peer, "127.0.0.1");
  assert.equal(await get(port, { rejectUnauthorized: false }), 403);
  const wrongClient = new PinnedAgent(await createIdentity(key(), "browser"), identityPublicKey(secret, "app"));
  t.after(() => wrongClient.destroy()); assert.equal(await get(port, { agent: wrongClient }), 403);
  const wrongServer = new PinnedAgent(identity, identityPublicKey(key(), "app"));
  t.after(() => wrongServer.destroy()); await assert.rejects(get(port, { agent: wrongServer }));
  await assert.rejects(get(port, { rejectUnauthorized: false, maxVersion: "TLSv1.2" }));
  assert.equal(hits, 1, "No unpaired request may reach the application loopback");
});

test("browser preparation keeps key/password private, profile temporary, and shell quoting literal", async t => {
  const directory = await mkdtemp(join(tmpdir(), "goon-browser-preparation-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const password = "synthetic'$(printf not-executed)";
  const values = input({ browser_password: password });
  await writeFile(join(directory, "options.json"), JSON.stringify(values));
  let checked = false;
  const prepared = await prepareBrowser({ dataDirectory: directory, temporaryDirectory: directory, uid: process.getuid(), gid: process.getgid(),
    checkConnection: async (host, agent) => { checked = true; assert.equal(host, "8eef53e8-goon-calendar-sync"); assert.ok(agent instanceof PinnedAgent); } });
  assert.ok(checked); assert.equal((await stat(join(directory, "options.json"))).mode & 0o777, 0o600);
  assert.equal((await stat(prepared.directory)).mode & 0o777, 0o700); assert.equal((await stat(prepared.runtime)).mode & 0o777, 0o600);
  assert.equal((await stat(prepared.profile)).uid, process.getuid()); assert.match(prepared.environment.FIREFOX_CLI, /--profile .* --private-window http:\/\/127\.0\.0\.1:8080/);
  assert.ok(!(await readFile(prepared.runtime, "utf8")).includes(values.pairing_key));
  assert.ok(!JSON.stringify(prepared.environment).includes(values.pairing_key));
  const envFile = join(directory, "goon-login-environment.sh");
  assert.equal((await stat(envFile)).mode & 0o777, 0o600);
  assert.equal(execFileSync("/bin/sh", ["-c", '. "$1"; printf "%s" "$PASSWORD"', "test", envFile], { encoding: "utf8" }), password);
  assert.equal(prepared.environment.SELKIES_ALLOWED_ORIGINS, "https://ha.test.invalid:3081");
  assert.equal(prepared.environment.SELKIES_COMMAND_ENABLED, "false|locked");
});

test("failed pairing closes startup and leaves no temporary profile or environment", async t => {
  const directory = await mkdtemp(join(tmpdir(), "goon-browser-failed-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "options.json"), JSON.stringify(input()));
  await assert.rejects(prepareBrowser({ dataDirectory: directory, temporaryDirectory: directory, uid: process.getuid(), gid: process.getgid(), checkConnection: async () => { throw new Error("synthetic-test-failure"); } }));
  assert.deepEqual(await readdir(directory), ["options.json"]);
});

test("HA packaging separates browser data, keeps default security and starts its proxy before the desktop", async () => {
  const main = JSON.parse(await text("../goon_calendar_sync/config.json"));
  const browser = JSON.parse(await text("../goon_google_login/config.json"));
  for(const directory of ['goon_calendar_sync','goon_google_login']){
    const config=JSON.parse(await text('../'+directory+'/config.json'));
    const translations=JSON.parse(await text('../'+directory+'/translations/de.json'));
    assert.deepEqual(Object.keys(translations.configuration).sort(),Object.keys(config.schema).sort());
  }
  assert.equal(main.options.google_login_browser_enabled, false);
  assert.equal(browser.version, main.version + "-browser"); assert.equal(browser.image, main.image);
  assert.equal(browser.init, false); assert.equal(browser.boot, "manual"); assert.equal(browser.tmpfs, true); assert.equal(browser.apparmor, true);
  assert.deepEqual(browser.ports, { "3001/tcp": 3081 });
  for (const forbidden of ["map", "privileged", "full_access", "host_network", "host_pid", "host_ipc", "docker_api", "hassio_api", "homeassistant_api", "ingress"]) assert.equal(browser[forbidden], undefined);
  assert.equal((await text("../goon_google_login/root/etc/s6-overlay/s6-rc.d/svc-goon-proxy/notification-fd")).trim(), "3");
  await text("../goon_google_login/root/etc/s6-overlay/s6-rc.d/svc-de/dependencies.d/svc-goon-proxy");
  const dockerfile = await text("../goon_google_login/Dockerfile");
  assert.match(dockerfile, /firefox@sha256:[a-f0-9]{64}/); assert.doesNotMatch(dockerfile, /latest|docker\.sock/);
});
