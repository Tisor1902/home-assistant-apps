# 0.2.0

- Anwendung auf den geprüften Hauptprojekt-Commit `e17b20d` aktualisiert; weiterhin feste Code-Version mit SHA-256 statt automatischem `latest`-Update.
- Dark Mode, dauerhaft sichtbare Monatsansicht, zusammengeführte Monatssteuerung und überarbeitete Dienstübersicht.
- ICS-Import mit Bearbeiten/Löschen und Vorrang bei Dienstkollisionen; mehrere Dienste am selben Tag und GOON-Freigabestatus.
- Vollautomatischer Kalenderabgleich, Adressübernahme nur bei fehlender lokaler Adresse, Fortschrittsanzeige und einsehbare Fehlerdetails.
- Begrenztes automatisches Abruffenster, jährliche Nachprüfung, gezielte Wiederholungen und Google-Neuanmeldung ohne doppelte Kalenderziele.
- Mehrere Benachrichtigungskanäle (Telegram, Home Assistant, E-Mail, Webhook) mit auswählbaren Ereignissen und Zustellstatus.
- Gleiche App-ID, Datenpfade, Optionen und verpflichtende Web-Anmeldung. Bestehende Daten werden beim Update weiterverwendet, nicht neu importiert. Vorher ein HA-Backup einschließlich dieser App erstellen; nicht deinstallieren.
- Der zusätzliche Google-Anmeldebrowser bleibt Unraid/Compose vorbehalten. Auf HA weiterhin HTTPS-Adresse oder separat eingerichteten Loopback-Tunnel für eine neue Google-Anmeldung verwenden.

# 0.1.2

- Längenvorgabe für das Web-Passwort entfernt; auch ein einzelnes Zeichen wird akzeptiert. Keine Mindestlänge von 12 Zeichen mehr und kein eigenes Maximallimit für dieses Feld.
- Das Passwort bleibt erforderlich, die Web-Anmeldung aktiv. Leere Eingaben und Steuerzeichen werden weiterhin abgelehnt, ohne eingegebene Werte auszugeben.
- Hinweise in HA und Dokumentation aktualisiert; Regressionstests für kurze Passwörter und Browser-Login ergänzt.
- Keine Änderung an Datenbank, Import, Goon-Zugang oder Kalendersynchronisation.

# 0.1.1

- Öffentliche HA-Veröffentlichung mit eigenem versionierten Container-Image.
- Reproduzierbarer Build aus geprüftem Quellpaket mit fester SHA-256, ohne privaten Repository-/Registry-Zugang.
- Automatische Tests, Secret-Scan, Image-Prüfung und Offline-Browser-Smoke-Test vor dem Push.
- Installationsanleitung für Repository-URL, aktuelle Samba-Freigaben und getrennte App-IDs.
- Lokale Exportpakete bauen weiterhin selbst und verweisen nicht auf ein Registry-Image.
- Keine Änderung an Dienstplanprüfung, Kalenderlogik, Zugangsschutz oder Nutzer-Datenbank.

# 0.1.0

- Erste HA-OS-Verpackung für amd64, Core-Commit `58f2a07`.
- Konfiguration über HA, verpflichtende Web-Anmeldung, persistentes `/data`.
- Startbestätigung verhindert versehentlichen Betrieb vor Abschluss des Umzugs.
- Sicherer einmaliger Import konsistenter Goon-Sicherungen ohne Überschreiben.
- Lokales Installationspaket ohne private Registry-Zugangsdaten.
- Kalte HA-Backups, Healthcheck, Schutzmodus/AppArmor bleiben aktiv.
- Experimentell bis zum erfolgreichen Live-Test auf HA OS; kein Ingress/ARM-Support.
