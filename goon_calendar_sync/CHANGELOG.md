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
