import { prepare } from "./bootstrap.mjs";
import { ConfigurationError } from "./options.mjs";

process.umask(0o077);
let prepared;
try {
  prepared = await prepare();
  for (const name of ["SUPERVISOR_TOKEN", "HASSIO_TOKEN", "GODO_USERNAME", "GODO_PASSWORD", "APP_PASSWORD"]) delete process.env[name];
  Object.assign(process.env, prepared.environment);
  if (prepared.imported === "imported") process.stdout.write("Vorhandene Goon-Datenbank sicher übernommen.\n");
  process.stdout.write("Goon-HA startet. App-Anmeldung ist aktiv; Konfigurationswerte werden nicht protokolliert.\n");
  await import("/app/src/app.mjs");
} catch (error) {
  if (prepared) await prepared.cleanup().catch(() => {});
  process.stderr.write(`${error instanceof ConfigurationError ? error.message : "Goon-HA konnte nicht starten. Konfiguration und Dateiberechtigungen prüfen."}\n`);
  process.exitCode = 1;
}
