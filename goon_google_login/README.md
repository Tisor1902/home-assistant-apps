# Goon Google-Anmeldebrowser

Optionaler Firefox für die Google-Kalender-Anmeldung auf HA OS (amd64). Löst die feste Rückleitung `http://127.0.0.1:8080/oauth/google/callback`, ohne öffentliche Domain oder Zugriff auf Docker/Host-Netzwerk. Benötigt **Goon Calendar Sync ab 0.3.0** aus demselben Repository.

Nur für die Anmeldung starten; Autostart und Watchdog aus lassen. Das Browserfenster hat ein eigenes HTTPS-Passwort. Nach spätestens 30 Minuten (einstellbar) stoppt die App. Profile und Cookies liegen ausschließlich temporär im RAM; die Kalenderverbindung bleibt in der Haupt-App gespeichert.

Vor dem ersten Start die **Dokumentation** lesen und beide Apps über einen privaten technischen Schlüssel koppeln. Keine Passwörter, Tokens oder Schlüssel in Chat/GitHub teilen. Keine offizielle Anwendung von ASB, Godo oder Google.
