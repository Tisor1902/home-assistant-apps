import { pairingKey } from "../../goon_calendar_sync/ha/login-transport.mjs";

export class BrowserConfigurationError extends Error {}
const invalid = (field, message) => { throw new BrowserConfigurationError(`${field}: ${message}`); };

export function browserOptions(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > 65_536) invalid("Konfiguration", "Ungültige Größe.");
  let input;
  try { input = JSON.parse(raw); } catch { invalid("Konfiguration", "Gültiges JSON erforderlich."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("Konfiguration", "Objekt erforderlich.");
  const value = { goon_app_slug: "8eef53e8_goon_calendar_sync", browser_username: "login", session_minutes: 30, timezone: "Europe/Berlin", ...input };
  if (typeof value.goon_app_slug !== "string" || !/^(?:[a-f0-9]{8}|local)_goon_calendar_sync$/.test(value.goon_app_slug)) invalid("goon_app_slug", "App-ID der installierten Goon-App erforderlich, kein Hostname oder externer Server.");
  let key;
  try { key = pairingKey(value.pairing_key); } catch { invalid("pairing_key", "Privater Kopplungsschlüssel mit 64 Hex-Zeichen erforderlich."); }
  if (typeof value.browser_username !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(value.browser_username)) invalid("browser_username", "Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich erforderlich.");
  if (typeof value.browser_password !== "string" || !value.browser_password.trim() || /[\u0000-\u001f\u007f]/.test(value.browser_password)) invalid("browser_password", "Nicht leeres Passwort ohne Steuerzeichen erforderlich; keine Längenvorgabe.");
  let origin;
  try { origin = new URL(value.browser_origin); } catch { invalid("browser_origin", "Tatsächlich verwendete HTTPS-Adresse des Browsers erforderlich."); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") invalid("browser_origin", "HTTPS-Ursprung ohne Pfad oder Zugangsdaten erforderlich.");
  if (!Number.isInteger(value.session_minutes) || value.session_minutes < 5 || value.session_minutes > 120) invalid("session_minutes", "Ganzzahl zwischen 5 und 120 erforderlich.");
  if (typeof value.timezone !== "string") invalid("timezone", "IANA-Zeitzone erforderlich.");
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }); } catch { invalid("timezone", "IANA-Zeitzone erforderlich."); }
  return { targetHost: value.goon_app_slug.replaceAll("_", "-"), pairingKey: key, origin: origin.origin,
    username: value.browser_username, password: value.browser_password.trim(), sessionMinutes: value.session_minutes, timezone: value.timezone };
}
