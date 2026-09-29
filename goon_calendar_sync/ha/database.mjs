import { DatabaseSync, backup } from "node:sqlite";
import { lstat, open, chmod, mkdir, mkdtemp, link, rm, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ConfigurationError } from "./options.mjs";

const requiredTables = ["baseline_events", "changes", "private_settings", "calendar_targets", "calendar_event_links"];
const markerText = "goon-ha-import-v1\n";

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

export function validateDatabase(database) {
  const result = database.prepare("PRAGMA integrity_check").all();
  const names = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  if (result.length !== 1 || Object.values(result[0])[0] !== "ok" || requiredTables.some(name => !names.has(name))) {
    throw new ConfigurationError("Datenbank ist beschädigt oder keine unterstützte Goon-Datenbank.");
  }
}

export async function snapshotDatabase(source, destination) {
  let database;
  let tempDirectory;
  try {
    if (!(await lstat(source)).isFile()) throw new Error("not a regular file");
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      if (await exists(destination + suffix)) {
        throw new ConfigurationError("Zieldatenbank existiert bereits; sie wird niemals überschrieben.");
      }
    }
    database = new DatabaseSync(source, { readOnly: true });
    validateDatabase(database);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    tempDirectory = await mkdtemp(join(dirname(destination), ".goon-snapshot-"));
    const temporary = join(tempDirectory, "snapshot.sqlite");
    await (await open(temporary, "wx", 0o600)).close();
    await backup(database, temporary);
    const verification = new DatabaseSync(temporary);
    try {
      verification.exec("PRAGMA journal_mode=DELETE;");
      validateDatabase(verification);
    } finally { verification.close(); }
    await chmod(temporary, 0o600);
    const handle = await open(temporary, "r");
    try { await handle.sync(); } finally { await handle.close(); }
    await link(temporary, destination);
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError("Datenbank-Sicherung fehlgeschlagen. Quelldatei, Berechtigungen und freien Speicher prüfen; keine vorhandene Zieldatei wurde ersetzt.");
  } finally {
    database?.close();
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
  }
}

export async function importDatabase({ requested, source, destination }) {
  if (!requested) return "disabled";
  const marker = join(dirname(destination), ".ha-import-complete");
  if (await exists(marker)) {
    if (await readFile(marker, "utf8") !== markerText || !(await exists(destination))) {
      throw new ConfigurationError("Import-Marker und Datenbank passen nicht zusammen. Import nicht wiederholt; Sicherung prüfen.");
    }
    return "already-imported";
  }
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (await exists(source + suffix)) {
      throw new ConfigurationError("Import erwartet eine abgeschlossene SQLite-Sicherung ohne WAL/SHM/Journal, keine kopierte Live-Datenbank.");
    }
  }
  await snapshotDatabase(source, destination);
  await writeFile(marker, markerText, { flag: "wx", mode: 0o600 });
  return "imported";
}
