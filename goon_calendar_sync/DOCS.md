# Installation und Umzug auf HA OS

## 1. Lokale App installieren

Voraussetzung: HA OS auf amd64, Zugriff auf den HA-Ordner `addons` über Samba oder SSH. Bei älteren HA-Versionen heißt „Apps“ noch „Add-ons“.

1. Das lokale Paket `goon-ha-local-0.1.0-58f2a07.tar.gz` auf dem Laptop entpacken. Den Ordner `goon_calendar_sync` vollständig nach `/addons/` auf HA kopieren; über Samba in die Freigabe `addons`. Ergebnis: `/addons/goon_calendar_sync/config.json` und `Dockerfile`.
2. In HA **Einstellungen → Apps → App installieren/App-Store → ⋮ → Nach Updates suchen**. Unter „Lokale Apps“ erscheint „Goon Calendar Sync“.
3. Installieren. HA baut das Image selbst. Der erste Build lädt ein größeres Playwright-Basisimage; einige Minuten und mehrere GB freier Speicher sind sinnvoll. Kein GitHub-Passwort oder Token nötig.
4. Noch **nicht starten**. Autostart ist zunächst aus. Im Reiter „Konfiguration“ Goon-Zugang sowie ein separates Web-Passwort (mindestens 12 Zeichen) eintragen. Zugangsdaten niemals in Chat, GitHub oder Screenshots teilen.

Schutzmodus eingeschaltet lassen. Kein Host-Netzwerk und kein privilegierter Zugriff erforderlich. Standard-Webport ist `8098`, in HA unter „Netzwerk“ änderbar.

## 2. Bestehende Daten übernehmen (empfohlen)

Die Datenbank enthält Dienste, Adressen, Freigaben, Abrufintervall, Google-/CalDAV-Zugangsdaten sowie die Verknüpfungen zu bereits angelegten Terminen. Ihre Übernahme vermeidet eine neue Zuordnung derselben Kalendertermine. Sie ist **vertraulich** und gehört nicht ins Installationspaket.

1. Den bisherigen Container auf dem Laptop stoppen. Bis zum Abschluss des Umzugs ausgeschaltet lassen. Für einen späteren automatischen Neustart des Laptops sicherstellen, dass dort keine zweite Instanz startet.
2. Eine konsistente SQLite-Sicherung erzeugen, nicht nur die laufende `.sqlite`-Datei kopieren. Im HA-Verpackungsprojekt mit Node.js 24+:

   ```bash
   node scripts/backup-database.mjs \
     /pfad/zum/goon-calendar-sync/data/godo-sync.sqlite \
     /privater/ordner/godo-sync.sqlite
   ```

   Das Ziel darf noch nicht existieren. Das Skript nutzt SQLite-Backup, prüft Integrität und Goon-Tabellen, berücksichtigt committed WAL-Daten und erstellt eine einzelne Datei mit Rechten `0600`.
3. Diese Sicherung über einen vertrauenswürdigen Übertragungsweg nach `/addon_configs/local_goon_calendar_sync/import/godo-sync.sqlite` auf HA kopieren. Bei einer späteren Repository-Installation lautet der Präfix statt `local` der Repository-Hash. HA stellt der App ausschließlich ihren eigenen Konfigurationsordner schreibgeschützt als `/config` bereit.
4. **Bestehende Datenbank einmalig übernehmen** (`import_existing_database`) einschalten. Der Import erfolgt ausschließlich, wenn auf HA noch keine Datenbank/SQLite-Nebendatei existiert. Er überschreibt niemals vorhandene Daten.
5. Prüfen, dass der Laptop-Sync tatsächlich gestoppt ist, dann **Bisherige Sync-Instanz gestoppt** (`active_instance`) einschalten. Erst jetzt starten. Kalender können sofort beim Start synchronisiert werden, auch wenn der automatische Goon-Abruf deaktiviert ist.
6. Nach erfolgreichem Start `http://HA-IP:8098/` oder „Weboberfläche öffnen“ aufrufen und mit dem separat festgelegten App-Benutzer anmelden. Dienste, Adressen, Abrufintervall, Kalenderziel und Verbindungen kontrollieren.
7. Nach erfolgreicher Kontrolle `import_existing_database` wieder ausschalten und die Importkopie aus dem HA-Konfigurationsordner entfernen; eine geschützte externe Sicherung behalten. Ein erfolgreicher Import wird zusätzlich intern markiert und auf Neustarts nicht wiederholt.
8. Erst nach erfolgreichem Test Autostart und optional Watchdog in HA einschalten. Der Laptop-Sync bleibt aus.

**Wichtig:** `active_instance` ist eine manuelle Bestätigung, kein automatischer Vergleich mit dem Laptop. Wird das HA-Backup auf einem anderen Gerät wiederhergestellt, vor dessen Start unbedingt alle bisherigen Instanzen stoppen. Vorhandene Einstellungen aus der Goon-Weboberfläche haben Vorrang vor den HA-Startwerten für Abrufintervall und Aktivierung.

## 3. Neue Installation ohne Datenübernahme

Nur wenn keine Daten übernommen werden sollen: `import_existing_database` aus lassen, Goon-/App-Zugang konfigurieren und `active_instance` nach Prüfung anderer Instanzen bestätigen. Die App erstellt eine neue Datenbank. Google/CalDAV anschließend in der Weboberfläche verbinden und den eigenen Dienstplan-Kalender auswählen.

Bei einem bereits gefüllten Kalender nicht blind eine zweite neue Instanz aktivieren: Der bisherige Datenbestand und die gespeicherten Kalender-Verknüpfungen sollten vorzugsweise übernommen werden. Andernfalls den bestehenden Terminbestand zuerst über die Abgleich-/Freigabefunktionen zuordnen.

## Google-Anmeldung und HTTPS

Bereits gespeicherte gültige Google-Refresh-Tokens funktionieren grundsätzlich unabhängig von der Browser-Adresse weiter. Die Datenbank-Übernahme erhält sie; eine erneute Zustimmung kann bei widerrufenen/abgelaufenen Tokens trotzdem erforderlich werden.

Eine **neue** Google-Anmeldung per OAuth funktioniert nicht einfach über eine beliebige private HTTP-IP wie `http://192.168.x.x:8098`. Für eine neue Anmeldung entweder:

- Einen eigenen HTTPS-Zugang über eine feste Domain und einen korrekt konfigurierten Reverse Proxy verwenden. `public_base_url` auf genau diesen Ursprung setzen, etwa `https://dienstplan.example.de`. In Google exakt `https://dienstplan.example.de/oauth/google/callback` als Redirect-URI registrieren. Proxy muss Host/Protokoll korrekt weiterreichen. Die Option richtet selbst weder HTTPS noch einen Proxy ein.
- Für die Einrichtung einen SSH-Tunnel auf einen lokalen Loopback-Port verwenden, die Oberfläche darüber öffnen und eine dazu passende `http://localhost:PORT/oauth/google/callback`-URI in Google registrieren. Das erfordert bereits eingerichteten SSH-Zugriff und wird separat gemeinsam konfiguriert.

HA Cloud/Nabu Casa stellt die App an Port 8098 nicht automatisch bereit. Version 0.1.0 verwendet bewusst noch kein HA-Ingress: Die Anwendung hat eigene Root-Pfade, Cookies und OAuth-Callbacks. Keine Portfreigabe ins Internet einrichten. Im nicht vertrauenswürdigen Netz sind HTTP-Anmeldung und Nutzdaten unverschlüsselt; dort HTTPS/VPN verwenden.

## Abruf, Ressourcen und Sicherung

- Standard: 720 Minuten Pause zwischen abgeschlossenen Abrufen, also ungefähr zweimal täglich. Individuelle Intervalle weiterhin in der Goon-Weboberfläche einstellbar.
- Fehlende Kollegen bleiben zulässig. Die bestehenden Prüfungen von Home-/Abteilungsdienstplänen bleiben unverändert.
- `/data` überlebt App-Updates/Neustarts und enthält die Datenbank. HA-Backups müssen diese App einschließen. Backups verschlüsseln bzw. geschützt aufbewahren: Sie enthalten Kalender-Tokens und die HA-Optionen mit Passwörtern.
- `cold`-Backup stoppt die App kurzzeitig für eine konsistente SQLite-Sicherung. Ein Restore kann frühere Kalender-Verknüpfungen zurückbringen; vor Wiederaufnahme kontrollieren und keine zweite Instanz parallel starten.
- Auf dem i3/8-GB-System ist die erste Variante zum Testen vorgesehen. Tatsächliche Last und HA-AppArmor-Verhalten müssen auf dem Zielgerät geprüft werden; die lokalen Container-Tests sind keine Messung des HA-Geräts.

## Wenn etwas nicht startet

- `Start gesperrt`: Alte Instanz stoppen, danach `active_instance` bestätigen.
- Passwortfehler: Eigenes App-Passwort mit mindestens 12 Zeichen hinterlegen. Keine Passwörter in Fehlerberichte kopieren.
- Importquelle fehlt: Dateiname und Ordner aus Schritt 2 prüfen. Nicht die Datenbank der Home-Assistant-Hauptanwendung verwenden.
- Vorhandene Zieldatenbank: Es wurde nichts überschrieben. Keine Daten löschen. Zunächst HA-Backup anlegen und den gewünschten Datenbestand klären.
- Unterbrochener Import ohne Abschlussmarker: Bestehende HA-Datenbank wird nicht ersetzt. Nach Überprüfung/Sicherung ggf. Importoption abschalten; nicht einfach löschen und erneut importieren.
- Image-/Registry-Fehler bei der schlanken Repository-Variante: Das erzeugte lokale Paket verwenden; es braucht keinen privaten Registry-Zugriff.
- Chromium-/AppArmor-Fehler auf HA: Nicht Schutzmodus/AppArmor ausschalten. Zunächst die bereinigte Fehlermeldung und HA-Version untersuchen.
- `/health` prüft nur den laufenden HTTP-Dienst. Ein grüner Watchdog beweist keinen erfolgreichen Goon- oder Google-Abruf. Den letzten erfolgreichen Abruf und Kalenderstatus in der Weboberfläche kontrollieren.

Offizielle Grundlagen: [HA-Konfiguration](https://developers.home-assistant.io/docs/apps/configuration/), [lokale Installation und Tests](https://developers.home-assistant.io/docs/apps/testing/), [Google OAuth Webserver-Ablauf](https://developers.google.com/identity/protocols/oauth2/web-server).
