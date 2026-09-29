# Prüfstand 0.1.0 – 30. September 2026

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

Das Archiv enthält 35 Dateien einschließlich Herkunfts-/Hashmanifest: ausschließlich ausgewählte Core-Code-Dateien und HA-Verpackung. Keine Datenbank, Secrets, `.env`, Git-Historie oder uncommittete Core-Dateien. Wegen des privaten Core-Quellcodes trotzdem nicht öffentlich verteilen.

## Noch auf dem Zielgerät zu prüfen

1. Erkennung/Installation durch HA Supervisor auf dem HP ProDesk (amd64).
2. Start mit unverändert aktiviertem Schutzmodus und HA-AppArmor-Profil. Lokaler Docker-Test ersetzt diesen Profiltest nicht.
3. Bewusster Umzug: alte Instanz stoppen, finale SQLite-Sicherung erstellen, sicher übertragen und importieren. Nie zwei aktive Kalender-Sync-Instanzen.
4. Goon-Live-Abruf, vorhandene Google-Verbindung, Kalendervergleich, tatsächlicher Ressourcenbedarf sowie HA-Backup/Restore.
5. Für eine neue Google-Anmeldung gegebenenfalls HTTPS-Adresse oder Loopback-Tunnel und Google-Redirect-URI einrichten.

Installation und Umzug: [DOCS.md](goon_calendar_sync/DOCS.md).
