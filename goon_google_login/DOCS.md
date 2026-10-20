# Google-Anmeldung auf HA OS

## Vorbereitung

HA OS auf amd64, **Goon Calendar Sync ab 0.3.0** und diese zusätzliche App aus dem Repository `https://github.com/Tisor1902/home-assistant-apps`. Die Apps haben eigene Datenverzeichnisse. Der Browser benötigt keine Goon-Datenbank und keine Supervisor-/Docker-Rechte.

Vor dem Update der Haupt-App ein HA-Backup einschließlich **Goon Calendar Sync** erstellen. Bestehende App aktualisieren, nicht deinstallieren oder die Datenbank erneut importieren. Keine zweite aktive Goon-Instanz am selben Kalender betreiben.

## Einmalig koppeln

1. Auf deinem eigenen Rechner oder im HA-SSH-Terminal `openssl rand -hex 32` ausführen. Den zufälligen Schlüssel nur direkt in die folgenden HA-Optionsfelder kopieren, nicht in Chat oder Screenshots teilen. Das ist ein technischer Schlüssel, keine Vorgabe für deine Passwortlänge.
2. In **Goon Calendar Sync** `google_login_browser_enabled` einschalten, `google_login_pairing_key` auf diesen Schlüssel und `google_login_browser_url` auf `https://ha.internal:3081` setzen. Speichern und die Haupt-App neu starten. Die normale Oberfläche bleibt unter `http://ha.internal:8098` erreichbar.
3. In **Goon Google-Anmeldebrowser**:
   - `goon_app_slug`: vollständige ID der Haupt-App, hier normalerweise `8eef53e8_goon_calendar_sync`; lokal `local_goon_calendar_sync`. Die ID steht im App-Konfigurationsordner oder in der HA-Seitenadresse. Keine IP/URL.
   - `pairing_key`: derselbe Schlüssel wie in Schritt 2.
   - `browser_origin`: exakt die HTTPS-Adresse aus Schritt 2, z. B. `https://ha.internal:3081`. Bei Nutzung einer IP oder eines anderen Ports beide Felder entsprechend anpassen. Kein Unterpfad.
   - `browser_username` und `browser_password`: eigene Zugangsdaten nur für das Browserfenster, nicht das Google-Passwort. Nicht leer, keine Längenvorgabe.
   - `session_minutes`: maximale Laufzeit (Standard 30, erlaubt 5–120 Minuten).
   - Autostart und Watchdog **aus** lassen. Speichern.
4. Im bereits verwendeten Google-Cloud-Webclient diese autorisierte Weiterleitungs-URI eintragen: **`http://127.0.0.1:8080/oauth/google/callback`**. Bereits vorhandene benötigte URIs nicht löschen. Der Browser ersetzt nicht die Einrichtung des eigenen OAuth-Clients und dessen Testnutzer/Freigabe.

Die Haupt-App zuerst starten. Bei fehlender/falscher Kopplung bleibt der Browser geschlossen; es gibt keinen ungeschützten Ersatzmodus.

## Anmelden

1. Browser-App starten. „Weboberfläche öffnen“ oder `https://ha.internal:3081` öffnen. Das lokale Fenster verwendet ein selbstsigniertes Zertifikat. Nur bei **deiner eigenen bekannten HA-Adresse** die Zertifikatsausnahme bestätigen; niemals eine Google-Zertifikatswarnung übergehen.
2. Mit den separaten Browser-Zugangsdaten anmelden. Im angezeigten Firefox lädt Goon über `127.0.0.1:8080`. Dort nochmals mit deinem bisherigen **Goon-App-Webbenutzer** anmelden.
3. In **Kalendersynchronisation** die vorhandene Google-Verbindung **erneuern**. Falls kein Ziel existiert, Google verbinden und danach den Dienstplankalender auswählen. Google-Anmeldung und Zwei-Faktor-Abfrage selbst im angezeigten Firefox durchführen.
4. Nach erfolgreicher Rückleitung Browser-App stoppen. Die Haupt-App läuft unabhängig weiter, einschließlich automatischer Synchronisierung. Erneuerte Verbindung und bestehende Kalender-Zuordnungen bleiben dort gespeichert; kein Datenbankumzug nötig.

Die App stoppt spätestens zum Sitzungsende. Ein Neustart beginnt ein frisches, leeres Profil. Google-Cookies und Browserpasswörter werden nicht dauerhaft aufbewahrt. Bei Zeitablauf eine neue Sitzung starten oder vorher die Laufzeit erhöhen. USB-Sicherheitsschlüssel und Passkeys des Laptop-Browsers werden nicht automatisch an den entfernten Firefox durchgereicht; gegebenenfalls eine andere zulässige Zwei-Faktor-Methode verwenden. Google kann zusätzliche Prüfungen verlangen oder die Anmeldung nach eigenen Kontorichtlinien ablehnen.

## Sicherheit und Grenzen

- Getrennte Container ohne Docker-Socket, Host-Netzwerk, Goon-Datenbankzugriff oder zusätzliche Linux-Capabilities. Schutzmodus und AppArmor bleiben an.
- Der interne Kanal prüft beidseitig den gekoppelten TLS-Schlüssel, bevor HTTP-Daten weitergereicht werden. Port 8090 wird nicht auf HA veröffentlicht. Die normale App-Anmeldung bleibt zusätzlich erforderlich.
- Nur das passwortgeschützte **HTTPS**-Fenster wird auf Port 3081 freigegeben; kein ungeschützter HTTP-Port. Nur LAN/VPN, keine Internet-Portfreigabe. HA Cloud/Nabu Casa oder Ingress werden nicht automatisch eingerichtet.
- HA-Optionen und Backups enthalten Schlüssel und Browserpasswort, deshalb schützen. Bei Offenlegung Schlüssel **in beiden Apps** ersetzen, beide neu starten und Browserpasswort ändern.
- Das Firefox-Basisimage ist per Digest fixiert. Der Browser ist ein größeres zusätzliches Image und benötigt nur während der Anmeldung Ressourcen.
- Beide Komponenten verwenden dasselbe öffentliche GHCR-Paket mit verschiedenen Tags: Haupt-App `0.3.0`, Browser `0.3.0-browser`. Nicht vertauschen.
- Der lokale Export `goon-ha-local-…tar.gz` enthält nur die Haupt-App. Browser über das HA-Repository installieren und lokale Haupt-App über `local_goon_calendar_sync` koppeln.
- Lokale Tests verwenden synthetisches OAuth. Der Live-Test unter HA Supervisor/AppArmor mit deinem Google-Konto bleibt erforderlich. Keine Zugangsdaten für Fehlerberichte ausgeben.

## Fehlerbehebung

- **Verbindung/Kopplung fehlt:** Haupt-App mindestens 0.3.0, Browser-Modus an, gleiche Schlüssel und richtige App-ID prüfen. Haupt-App zuerst neu starten. Keine Schutzfunktionen ausschalten.
- **Leeres Fenster/abgelehnt:** `browser_origin` muss zur tatsächlich geöffneten HTTPS-Adresse samt Port passen. Benutzer/Passwort nur in HA prüfen. Desktop-Start kurz abwarten.
- **Google `redirect_uri_mismatch`:** Feste URI im verwendeten Google-Webclient exakt eintragen. Anmeldung im dargestellten Firefox starten, nicht im normalen Laptop-Browser.
- **Zeit abgelaufen:** Browser-App erneut starten. Der Kalender-Sync der Haupt-App bleibt erhalten.

Grundlagen: [HA-App-Konfiguration](https://contributors.home-assistant.io/apps/reference/configuration/), [LinuxServer Firefox](https://docs.linuxserver.io/images/docker-firefox/), [Google-Webserver-OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).
