import { readFile, writeFile, chmod, chown, lstat, mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get } from "node:https";
import { browserOptions, BrowserConfigurationError } from "./options.mjs";
import { createIdentity, identityPublicKey, PinnedAgent } from "../../goon_calendar_sync/ha/login-transport.mjs";

async function probe(host, agent) {
  await new Promise((resolve, reject) => {
    const failed = () => reject(new BrowserConfigurationError("Verbindung: Goon-App zuerst mit aktiviertem Browser-Modus und gleichem Kopplungsschlüssel starten."));
    const request = get({ host, port: 8090, path: "/health", agent, timeout: 10_000 }, response => { response.resume(); response.statusCode === 200 ? resolve() : failed(); });
    request.on("error", failed); request.on("timeout", () => request.destroy());
  });
}

export async function prepareBrowser({ dataDirectory = "/data", temporaryDirectory = "/tmp", uid = 1000, gid = 1000, checkConnection = probe } = {}) {
  let text;
  try {
    if (!(await lstat(dataDirectory)).isDirectory() || !(await lstat(join(dataDirectory, "options.json"))).isFile()) throw new Error();
    text = await readFile(join(dataDirectory, "options.json"), "utf8");
  } catch { throw new BrowserConfigurationError("Privater HA-Konfigurationsordner nicht lesbar."); }
  const options = browserOptions(text);
  // The Firefox user must never be able to read HA options containing the key.
  await chmod(dataDirectory, 0o700); await chmod(join(dataDirectory, "options.json"), 0o600);
  const directory = await mkdtemp(join(temporaryDirectory, "goon-browser-private-"));
  const profile = await mkdtemp(join(temporaryDirectory, "goon-browser-profile-"));
  let agent;
  try {
    const identity = await createIdentity(options.pairingKey, "browser");
    const expected = identityPublicKey(options.pairingKey, "app");
    agent = new PinnedAgent(identity, expected);
    await checkConnection(options.targetHost, agent);
    await mkdir(join(profile, "downloads")); await mkdir(join(profile, "cache"));
    await writeFile(join(profile, "user.js"), `user_pref("browser.privatebrowsing.autostart", true);\nuser_pref("signon.rememberSignons", false);\nuser_pref("browser.download.useDownloadDir", true);\nuser_pref("browser.download.dir", ${JSON.stringify(join(profile, "downloads"))});\n`, { mode: 0o600, flag: "wx" });
    for (const path of [profile, join(profile, "downloads"), join(profile, "cache"), join(profile, "user.js")]) await chown(path, uid, gid);
    const runtime = join(directory, "runtime.json");
    await writeFile(runtime, JSON.stringify({ identity, expected: expected.toString("base64"), targetHost: options.targetHost,
      expiresAt: Date.now() + options.sessionMinutes * 60_000 }), { mode: 0o600, flag: "wx" });
    const environment = {
      PUID: String(uid), PGID: String(gid), TZ: options.timezone, CUSTOM_USER: options.username, PASSWORD: options.password,
      GOON_LOGIN_RUNTIME_FILE: runtime, FIREFOX_CLI: `--profile ${profile} --private-window http://127.0.0.1:8080/#calendarSync`,
      TITLE: "Goon Google-Anmeldung (HA OS)", XDG_CACHE_HOME: join(profile, "cache"),
      HARDEN_DESKTOP: "true", HARDEN_OPENBOX: "true", PELORUS: "false", START_DOCKER: "false",
      SELKIES_COMMAND_ENABLED: "false|locked", SELKIES_ENABLE_CLIPBOARD: "false|locked", SELKIES_FILE_TRANSFERS: "none",
      SELKIES_ENABLE_SHARING: "false|locked", SELKIES_ENABLE_COLLAB: "false|locked", SELKIES_UI_SHOW_SIDEBAR: "false|locked",
      SELKIES_AUDIO_ENABLED: "false|locked", SELKIES_MICROPHONE_ENABLED: "false|locked", SELKIES_WEBCAM_ENABLED: "false|locked",
      SELKIES_GAMEPAD_ENABLED: "false|locked", SELKIES_ALLOWED_ORIGINS: options.origin,
    };
    const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    await writeFile(join(temporaryDirectory, "goon-login-environment.sh"), Object.entries(environment).map(([key, value]) => `export ${key}=${shellQuote(value)}\n`).join(""), { mode: 0o600, flag: "wx" });
    return { directory, profile, runtime, environment };
  } catch (error) { await rm(directory, { recursive: true, force: true }); await rm(profile, { recursive: true, force: true }); throw error; }
  finally { agent?.destroy(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  try { await prepareBrowser(); }
  catch (error) { process.stderr.write(`${error instanceof BrowserConfigurationError ? error.message : "Anmeldebrowser bleibt aus: sichere Vorbereitung fehlgeschlagen."}\n`); process.exitCode = 1; }
}
