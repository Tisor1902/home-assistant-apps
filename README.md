# Goon Calendar Sync für Home Assistant OS

Öffentliche HA-Verpackung für den Goon-Kalender-Sync. Die Anwendung wird weiterhin in `Tisor1902/goon-calendar-sync` entwickelt; dieses Entwicklungs-Repository kann privat bleiben. Veröffentlichte Code-Stände liegen als geprüfte Release-Pakete vor. `core.lock.json` legt Core-Commit, Download und SHA-256 fest. Es gibt keine zweite gepflegte Kopie des Anwendungscodes.

Ziel: HA OS auf **amd64**. Noch kein ARM-Support. Bis zum erfolgreichen Test auf echtem HA OS als `experimental` markiert. Keine offizielle Anwendung von ASB oder Godo.

## Installation über den HA-App-Store

Repository in **Einstellungen → Apps/Add-ons → App-Store → ⋮ → Repositories** hinzufügen:

```text
https://github.com/Tisor1902/home-assistant-apps
```

Alternativ: [Repository in Home Assistant hinzufügen](https://my.home-assistant.io/redirect/supervisor_addon_repository/?repository=https%3A%2F%2Fgithub.com%2FTisor1902%2Fhome-assistant-apps).

Danach „Goon Calendar Sync“ auswählen und installieren. HA lädt das versionierte Image `ghcr.io/tisor1902/goon-calendar-sync-ha:0.1.2`. Kein GitHub-Token und kein lokaler Build erforderlich. **Noch nicht starten**, wenn eine bisherige Instanz denselben Kalender verwaltet. Vorher die Daten übernehmen und die alte Instanz stoppen.

Beim ersten Veröffentlichen muss das GHCR-Paket separat auf **Public** gestellt und anonymes Herunterladen geprüft werden; die Sichtbarkeit des Repositorys allein genügt nicht.

Die vollständige Installations- und Umzugsanleitung steht in [goon_calendar_sync/DOCS.md](goon_calendar_sync/DOCS.md).

## Lokales Paket als Alternative

Die Release-Datei `goon-ha-local-0.1.2-58f2a07.tar.gz` kann weiterhin als lokale App installiert werden. HA baut sie selbst; Internet für das öffentliche Playwright-Basisimage und npm-Abhängigkeiten wird benötigt. Der Export entfernt dazu bewusst den `image`-Verweis aus der App-Konfiguration.

Das Paket enthält nur freigegebene Code-Dateien des fixierten Core-Commits und die HA-Verpackung. Keine Datenbank, keine echten Passwörter oder Tokens, keine Git-Historie. Ältere Release-Pakete bleiben als reproduzierbare Quellstände bestehen.

Mit Node.js 24+ und Git/tar im PATH:

```bash
node --test test/*.test.mjs
node scripts/export-local.mjs /pfad/zum/goon-calendar-sync
```

Ergebnis: versioniertes Paket in `dist/` mit SHA-256-Prüfsumme. Bereits vorhandene Pakete werden nicht überschrieben.

## Daten und Sicherheit

- Dauerhafte Daten im HA-App-Verzeichnis `/data`, inklusive Google-Verbindungen und Kalender-Zuordnungen.
- Anmeldung der Weboberfläche bleibt zwingend aktiv. Das eigene Web-Passwort hat keine Längenvorgabe, darf aber nicht leer sein oder Steuerzeichen enthalten.
- Port standardmäßig `8098`, aktuell kein Ingress. HTTP nur im vertrauenswürdigen LAN/VPN; nicht zum Internet freigeben.
- Zugangsdaten in HA konfigurieren, niemals per Chat oder GitHub. HA speichert Optionen in `/data/options.json`; HA-Backups und Datenbank enthalten ebenfalls Zugangsdaten und müssen geschützt werden.
- Keine HA-/Supervisor-/Docker-API, kein Host-Netzwerk, keine zusätzlichen Linux-Capabilities. Schutzmodus und AppArmor bleiben an.
- Start erst nach ausdrücklicher Bestätigung `active_instance`. Das ist eine Umzugs-Sicherung, **keine verteilte Sperre**. Nie zwei aktive Instanzen am selben Kalender betreiben.
- HA-Backups stoppen die App kurz (`cold`), damit SQLite konsistent gesichert wird.
- Eine Person/ein Goon-Konto je Instanz. Andere Personen benötigen eine neue leere Datenbank und eine eigene Kalenderverbindung. Keine Datenbanksicherung eines anderen Nutzers importieren.
- HA-Version auf `goon.asb-bw.de` ausgelegt; abweichende Goon-Systeme, Berechtigungen oder Planstrukturen sind nicht pauschal unterstützt.

## Image-Variante und Updates

Der Dockerfile lädt einen öffentlich bereitgestellten, per SHA-256 geprüften Quellstand und installiert die darin eingefrorenen Abhängigkeiten. Er benötigt keinen Zugriff auf das private Core-Image. Zugangsdaten gehören weder in Repository-URLs noch in Build-Argumente oder Images.

Der Paket-Exporter erzeugt einen Dockerfile aus den **committeten** Core-Dateien plus HA-Startschicht. Lokale, uncommittete Änderungen am Core werden ausdrücklich nicht mitgenommen. Bei einem Core-Update den geprüften Quellstand veröffentlichen, Commit/Download/Hash gemeinsam aktualisieren, App-Version erhöhen und erneut testen. Keine automatischen `latest`-Updates.

Repository-Installationen erhalten Updates über HA. Bei lokalen Installationen die Dateien in `/addons/goon_calendar_sync/` ersetzen und den Neubau ausführen. `/data` bleibt innerhalb derselben App-ID erhalten. **Der Wechsel von einer lokalen zur Repository-Installation hat eine andere App-ID und benötigt einen bewussten Datenumzug.** Vorher HA-Backup erstellen. Nicht deinstallieren, um zu aktualisieren: Deinstallation kann App-Daten löschen.

## Entwicklung und Prüfungen

```bash
node --test test/*.test.mjs
docker build -t goon-ha:test goon_calendar_sync
node scripts/check-image.mjs goon-ha:test
node scripts/smoke-container.mjs goon-ha:test
```

Der Smoke-Test verwendet nur generierte Test-Zugangsdaten, isolierte temporäre Daten und `--network none`. Er prüft die Startsperre, HTTP-Anmeldung, Chromium ohne vergrößertes `/dev/shm`, Persistenz und geordnetes Herunterfahren. Er stoppt ausschließlich seine eigenen Testcontainer, nie die produktive Instanz.

GitHub Actions führt Tests, Secret-Scan, Build, Image-Prüfung und Offline-Smoke-Test aus, bevor ein Image gepusht wird. Diese Tests ersetzen nicht den anschließenden Test mit Supervisor, HA-AppArmor, Goon und Google auf dem Zielgerät.

Grundlagen: [HA-App-Konfiguration](https://developers.home-assistant.io/docs/apps/configuration/), [lokales Testen/Installieren](https://developers.home-assistant.io/docs/apps/testing/).
