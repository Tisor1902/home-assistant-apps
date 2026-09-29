# Goon Calendar Sync für Home Assistant OS

Schlanke HA-Verpackung für den bestehenden Goon-Kalender-Sync. Die Anwendung wird weiterhin ausschließlich in `Tisor1902/goon-calendar-sync` entwickelt. `core.lock.json` legt den verwendeten Core-Commit fest; dieses Repository enthält keine zweite gepflegte Kopie des Anwendungscodes.

Ziel der ersten Version: HA OS auf **amd64**, beispielsweise dem HP ProDesk mit Intel i3-10100T. Noch kein ARM-Support. Vor dem ersten Test auf echtem HA OS als `experimental` markiert.

## Installation für das private Projekt

Empfohlen ist zunächst das erzeugte **lokale App-Paket**. Es wird direkt auf HA gebaut und benötigt dort keinen GitHub-Token und keinen Zugriff auf ein privates Container-Registry-Paket. Internet für das öffentliche Playwright-Basisimage und npm-Abhängigkeiten ist beim ersten Build erforderlich.

Das Paket enthält nur freigegebene Code-Dateien des fixierten Core-Commits und die HA-Verpackung. Keine Datenbank, keine Passwörter, keine Tokens, keine Git-Historie. Der Core ist trotzdem privater Quellcode: Paket nicht öffentlich weitergeben.

Mit Node.js 24+ und Git/tar im PATH:

```bash
node --test test/*.test.mjs
node scripts/export-local.mjs /pfad/zum/goon-calendar-sync
```

Ergebnis: `dist/goon-ha-local-0.1.0-58f2a07.tar.gz` mit SHA-256-Prüfsumme. Bereits vorhandene Pakete werden nicht überschrieben.

Die vollständige Installations- und Umzugsanleitung steht in [goon_calendar_sync/DOCS.md](goon_calendar_sync/DOCS.md).

## Daten und Sicherheit

- Dauerhafte Daten im HA-App-Verzeichnis `/data`, inklusive Google-Verbindungen und Kalender-Zuordnungen.
- Anmeldung der Weboberfläche bleibt zwingend aktiv, Web-Passwort mindestens 12 Zeichen.
- Port standardmäßig `8098`, kein Ingress in Version 0.1.0. HTTP nur im vertrauenswürdigen LAN/VPN; nicht zum Internet freigeben.
- Zugangsdaten in HA konfigurieren, niemals per Chat oder GitHub. HA speichert Optionen in `/data/options.json`; HA-Backups und Datenbank enthalten ebenfalls Zugangsdaten und müssen geschützt werden.
- Keine HA-/Supervisor-/Docker-API, kein Host-Netzwerk, keine zusätzlichen Linux-Capabilities. Schutzmodus und AppArmor bleiben an.
- Start erst nach ausdrücklicher Bestätigung `active_instance`. Das ist eine Umzugs-Sicherung, **keine verteilte Sperre**. Nie zwei aktive Instanzen am selben Kalender betreiben.
- HA-Backups stoppen die App kurz (`cold`), damit SQLite konsistent gesichert wird.

## Image-Variante und Updates

Der kleine Dockerfile unter `goon_calendar_sync/` setzt direkt auf dem in `core.lock.json` fixierten Core-Image auf. Er setzt entsprechenden Registry-Zugriff voraus. Ein privates GitHub-Repository lässt sich nicht einfach wie ein öffentliches App-Repository installieren; Zugangsdaten gehören weder in Repository-URLs noch in Docker-Build-Argumente.

Der Paket-Exporter erzeugt stattdessen einen Dockerfile aus den **committeten** Core-Dateien plus HA-Startschicht. Lokale, uncommittete Änderungen am Core werden ausdrücklich nicht mitgenommen. Bei einem Update Core-Commit und Image-Tag gemeinsam ändern, App-Version erhöhen, Tests ausführen und ein neues lokales Paket erstellen. Keine automatischen `latest`-Updates.

Ein Update der lokalen App ersetzt nur die Dateien in `/addons/goon_calendar_sync/`. `/data` wird durch HA separat verwaltet und bleibt erhalten. Vorher HA-Backup erstellen, danach im App-Store nach Updates suchen und Update/Neubau ausführen. Nicht deinstallieren, um zu aktualisieren: Deinstallation kann App-Daten löschen.

## Entwicklung und Prüfungen

```bash
node --test test/*.test.mjs
docker build --build-arg GOON_IMAGE=goon-calendar-sync-godo-calendar-sync:latest \
  -t goon-ha:test goon_calendar_sync
node scripts/smoke-container.mjs goon-ha:test
```

Der Smoke-Test verwendet nur generierte Test-Zugangsdaten, isolierte temporäre Daten und `--network none`. Er prüft die Startsperre, HTTP-Anmeldung, Chromium ohne vergrößertes `/dev/shm`, Persistenz und geordnetes Herunterfahren. Er stoppt ausschließlich seine eigenen Testcontainer, nie die produktive Instanz.

Diese Docker-Tests ersetzen nicht den anschließenden Test mit Supervisor, HA-AppArmor, Goon und Google auf dem Zielgerät.

Grundlagen: [HA-App-Konfiguration](https://developers.home-assistant.io/docs/apps/configuration/), [lokales Testen/Installieren](https://developers.home-assistant.io/docs/apps/testing/).
