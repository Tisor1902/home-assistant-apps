import { resolve } from "node:path";
import { snapshotDatabase } from "../goon_calendar_sync/ha/database.mjs";

process.umask(0o077);
const [source, destination, ...extra] = process.argv.slice(2);
if (!source || !destination || extra.length) {
  process.stderr.write("Aufruf: node scripts/backup-database.mjs QUELLE.sqlite NEUE-SICHERUNG.sqlite\n");
  process.exitCode = 1;
} else {
  try {
    await snapshotDatabase(resolve(source), resolve(destination));
    process.stdout.write("SQLite-Sicherung erstellt und geprüft (Dateirechte 0600). Enthält vertrauliche Kalender-Zugangsdaten; nicht veröffentlichen.\n");
  } catch {
    process.stderr.write("Sicherung fehlgeschlagen; Quelle, Rechte, freien Speicher und noch nicht vorhandenes Ziel prüfen.\n");
    process.exitCode = 1;
  }
}
