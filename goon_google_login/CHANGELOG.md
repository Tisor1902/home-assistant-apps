# 0.3.0-browser

- Separate HA-Browser-App für die Google-Anmeldung mit fester Loopback-Rückleitung.
- Passwortgeschützter HTTPS-Desktop, gegenseitig authentifizierter TLS-Kanal; keine Datenbank-/Docker-/Supervisor-Rechte.
- Temporäres Firefox-Profil im RAM, deaktivierte Desktop-Freigaben/Dateiübertragung und automatisches Sitzungsende.
- Manuell starten, kein Autostart. Bestehende Google-Ziele werden erneuert, nicht dupliziert.
- amd64 und experimentell; realer HA-/Google-Kontotest weiterhin erforderlich.
