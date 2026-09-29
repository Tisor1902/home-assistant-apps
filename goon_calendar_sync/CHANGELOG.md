# 0.1.0

- Erste HA-OS-Verpackung für amd64, Core-Commit `58f2a07`.
- Konfiguration über HA, verpflichtende Web-Anmeldung, persistentes `/data`.
- Startbestätigung verhindert versehentlichen Betrieb vor Abschluss des Umzugs.
- Sicherer einmaliger Import konsistenter Goon-Sicherungen ohne Überschreiben.
- Lokales Installationspaket ohne private Registry-Zugangsdaten.
- Kalte HA-Backups, Healthcheck, Schutzmodus/AppArmor bleiben aktiv.
- Experimentell bis zum erfolgreichen Live-Test auf HA OS; kein Ingress/ARM-Support.
