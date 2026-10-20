# Prüfstand 0.2.0 – 20. Oktober 2026

## Lokal erfolgreich geprüft

- Core-Commit `e17b20d2eb225c7163d85a2cf2b419effdb86773`: **307 Anwendungstests** im tatsächlich gebauten HA-Image `goon-ha-local:0.2.0` erfolgreich. Kein Netzwerkzugriff, nur synthetische Fixtures.
- **35 HA-Verpackungstests** erfolgreich: Konfiguration, Passwortschutz ohne Längenvorgabe, Startsperre, SQLite-Sicherung/Import, Paket-Allowlist, Herkunftsmanifest und festgelegte Version/Prüfsumme.
- Das echte lokale Installationspaket entpackt und vollständig gebaut. Alle 34 enthaltenen Core-Module stimmen mit dem Hauptprojekt überein; SHA-256-Fingerabdruck der sortierten Dateinamen und Inhalte: `1f8a67bbd2377bb40c7c90941a02ad34c2c692a6e62228ac809734f6c7ebe591`.
- Image-Prüfung erfolgreich: amd64, HA-Version 0.2.0, richtiger Core-Commit, neue Funktionsmodule, keine Nutzerdaten oder eingebetteten Zugangsdaten.
- Neuinstallation offline geprüft: Startsperre, Health, HTTP-401, Formularanmeldung/Chromium mit 64 MiB `/dev/shm`, neue Oberfläche, ICS-Import und deaktivierter Benachrichtigungskanal. Abrufintervall, ICS-Termin und Kanal bleiben nach Neustart erhalten; Datenbankrechte `0600`, ordentliches Herunterfahren und keine Test-Passwörter in Logs.
- Upgrade **aus dem tatsächlich veröffentlichten Image `ghcr.io/tisor1902/goon-calendar-sync-ha:0.1.2`** geprüft. Synthetische alte Dienste, Adressen, private Einstellungen, Google-Refresh-Token, Zielkalender-ID und Remote-Terminzuordnungen bleiben nach Start und erneutem Neustart erhalten. Zusätzlich funktionieren ICS-Import und Benachrichtigungskanal im migrierten Datenbestand.
- Beide Smoke-Tests verwenden eigene temporäre Daten, `--network none`, schreibgeschütztes Root-Dateisystem, `--cap-drop ALL`, `no-new-privileges` und 1 GiB Speicherlimit. Keine echten GOON-/Google-Zugänge und keine externen Benachrichtigungen. Kein gemessener Spitzenverbrauch eines Live-Abrufs.
- Vollständig redaktierter Gitleaks-Scan des Repositorys und des entpackten Veröffentlichungspakets ohne Funde.
- GitHub Actions prüft Neuinstallation und Upgrade vor dem Registry-Push erneut. App-ID, Datenverzeichnis, Optionen, Schutzmodus und AppArmor bleiben unverändert. Der HA-Start setzt den Google-Anmeldemodus ausdrücklich auf `direct`; der Unraid-Zusatzbrowser wird nicht aktiviert.
- Bestehenden lokalen Dienstplan-Container nicht neu gestartet, keine echten Kalender verändert und keine laufende HA-Installation aktualisiert.

## Installationspaket 0.2.0

Datei: `goon-ha-local-0.2.0-e17b20d.tar.gz` (48 Dateien einschließlich Herkunfts-/Hashmanifest).

SHA-256: `65d071a333cd16596eabed52292a1c25fb9b7014ba24ce15a7594e00110a4812`.

Nur ausgewählter committeter Anwendungscode und HA-Verpackung. Der Archiv-Download-Hash liegt außerhalb des Archivs; das Herkunftsmanifest enthält Core-Commit und Datei-Prüfsummen ohne zirkuläre Selbst-Prüfsumme.

## Grenzen und Installation

Supervisor-/AppArmor-Verhalten und echter GOON-/Google-Zugriff müssen weiterhin auf dem Zielgerät kontrolliert werden. Die App bleibt `experimental` und amd64; keine zusätzliche Zusage für ARM oder einen zweiten echten Nutzer. Vor dem Update ein HA-Backup einschließlich dieser App erstellen, die bestehende App aktualisieren und nicht neu installieren oder die Datenbank erneut importieren. Rückweg bei fehlgeschlagener Migration: die vor dem Update gesicherte App samt Daten über HA wiederherstellen, nicht nur einen älteren Image-Tag starten. Diese Veröffentlichung ändert eine bereits installierte HA-App nicht von selbst.

Installation und Update: [DOCS.md](goon_calendar_sync/DOCS.md).

## Historischer Prüfstand 0.1.0 – 30. September 2026

Bereit für den ersten **Test auf HA OS**, noch keine Bestätigung eines erfolgreichen Live-Betriebs auf dem Zielgerät.

## Erfolgreich geprüft

- Unveränderter Core-Commit `58f2a0750808c7b7afd53d5e95b390015bf60c89`: alle **147** bestehenden Tests erfolgreich. Einschließlich Monatsverifizierung, Kalender-Schreibsperren, Google/CalDAV-Abgleich und Browser-UI.
- HA-Verpackung: **32** Tests erfolgreich, zusätzlich auf GitHub Actions. Optionen/Passwortschutz, Startsperre, SQLite-WAL-Sicherung, Integrität, Import ohne Überschreiben, Neustart-Idempotenz, Paket-Allowlist und Prüfsummen.
- Schlankes HA-Image lokal gebaut: `goon-ha:0.1.0`, basierend auf dem vorhandenen lokalen Core-Image. Der private Registry-Download wurde nicht getestet; dem derzeitigen GitHub-Zugang fehlt `read:packages`.
- Tatsächliches lokales Installationspaket entpackt und dessen Dockerfile erfolgreich gebaut: `goon-ha-local:0.1.0`. Öffentliche Playwright-Basis, eingefrorene pnpm-Abhängigkeiten, keine privaten Registry-Zugangsdaten nötig.
- Auf **beiden** Images denselben isolierten Smoke-Test bestanden: Startsperre, Health, API-Zugriffsschutz, Formular-Login im Chromium, Dashboard, Speichern/Erhalten des Intervalls über Neustart, Datenbankrechte `0600`, ordentliches Herunterfahren sowie Logs ohne Test-Passwörter.
- Smoke-Test mit `--network none`, schreibgeschütztem Root-Dateisystem, `--cap-drop ALL`, `no-new-privileges`, 1 GiB Container-Speicherlimit und standardmäßig 64 MiB `/dev/shm`. Keine echten Goon-/Google-Zugänge verwendet. Das Speicherlimit ist kein gemessener Spitzenverbrauch eines echten Abrufs.
- Image-Labels: `amd64`, `io.hass.type=app`, Version `0.1.0`.
- Bestehende Anwendung unverändert, Core-Arbeitsverzeichnis sauber. Keine echte Datenbank kopiert, keine Kalendertermine geändert, produktiven Container nicht neu gestartet.

## Installationspaket

Datei: `goon-ha-local-0.1.0-58f2a07.tar.gz`

SHA-256:

```text
c2a4af2adde32cf52a0f343238c142c6d4eb160c171a4380f7203e2e0be97097
```

Das Archiv enthält 35 Dateien einschließlich Herkunfts-/Hashmanifest: ausschließlich ausgewählte Core-Code-Dateien und HA-Verpackung. Keine Datenbank, Secrets, `.env`, Git-Historie oder uncommittete Core-Dateien. Zunächst privat bereitgestellt; die Veröffentlichung dieses geprüften Code-Snapshots wurde anschließend vom Repository-Inhaber freigegeben. Das private Entwicklungs-Repository und seine Historie werden nicht veröffentlicht.

## Noch auf dem Zielgerät zu prüfen

1. Erkennung/Installation durch HA Supervisor auf dem HP ProDesk (amd64).
2. Start mit unverändert aktiviertem Schutzmodus und HA-AppArmor-Profil. Lokaler Docker-Test ersetzt diesen Profiltest nicht.
3. Bewusster Umzug: alte Instanz stoppen, finale SQLite-Sicherung erstellen, sicher übertragen und importieren. Nie zwei aktive Kalender-Sync-Instanzen.
4. Goon-Live-Abruf, vorhandene Google-Verbindung, Kalendervergleich, tatsächlicher Ressourcenbedarf sowie HA-Backup/Restore.
5. Für eine neue Google-Anmeldung gegebenenfalls HTTPS-Adresse oder Loopback-Tunnel und Google-Redirect-URI einrichten.

Installation und Umzug: [DOCS.md](goon_calendar_sync/DOCS.md).
