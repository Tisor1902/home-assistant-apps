import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseOptions, assertActive, environmentFor, ConfigurationError } from "./options.mjs";
import { importDatabase } from "./database.mjs";

export async function prepare({ dataDirectory = "/data", configDirectory = "/config", temporaryDirectory = "/tmp" } = {}) {
  let raw;
  try { raw = await readFile(join(dataDirectory, "options.json"), "utf8"); }
  catch { throw new ConfigurationError("HA-Konfiguration /data/options.json fehlt oder ist nicht lesbar."); }
  const options = parseOptions(raw);
  assertActive(options);
  const imported = await importDatabase({
    requested: options.import_existing_database,
    source: join(configDirectory, "import", "godo-sync.sqlite"),
    destination: join(dataDirectory, "godo-sync.sqlite"),
  });
  const directory = await mkdtemp(join(temporaryDirectory, "goon-ha-secrets-"));
  const secretFiles = {
    username: join(directory, "username"), password: join(directory, "password"), appPassword: join(directory, "app-password"),
  };
  try {
    await Promise.all([
      writeFile(secretFiles.username, options.godo_username, { mode: 0o600, flag: "wx" }),
      writeFile(secretFiles.password, options.godo_password, { mode: 0o600, flag: "wx" }),
      writeFile(secretFiles.appPassword, options.app_password, { mode: 0o600, flag: "wx" }),
    ]);
    return {
      environment: environmentFor(options, { dataDirectory, secretFiles }), imported,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
