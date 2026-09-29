export class ConfigurationError extends Error {}

function invalid(field, reason) {
  // Never interpolate a supplied value: configuration includes passwords.
  throw new ConfigurationError(`${field}: ${reason}`);
}

export function parseOptions(text) {
  if (Buffer.byteLength(text) > 65_536) throw new ConfigurationError("HA-Konfiguration ist zu groß.");
  try { return validateOptions(JSON.parse(text)); }
  catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError("HA-Konfiguration ist kein gültiges JSON-Objekt.");
  }
}

export function validateOptions(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ConfigurationError("HA-Konfiguration muss ein Objekt sein.");
  }
  const defaults = {
    app_username: "admin", active_instance: false, timezone: "Europe/Berlin",
    automatic_check_enabled: true, automatic_check_interval_minutes: 720,
    automatic_past_months: 1, automatic_future_months: 3,
    public_base_url: "", import_existing_database: false,
  };
  const value = { ...defaults, ...input };
  const output = {};
  for (const field of ["godo_username", "godo_password", "app_username", "app_password", "timezone"]) {
    const minimum = field === "app_password" ? 12 : 1;
    if (typeof value[field] !== "string" || value[field].trim().length < minimum ||
        value[field].length > 4096 || /[\u0000-\u001f\u007f]/.test(value[field])) {
      invalid(field, `Text mit mindestens ${minimum} Zeichen ohne Steuerzeichen erforderlich.`);
    }
    output[field] = value[field].trim();
  }
  if (output.app_username.includes(":")) invalid("app_username", "Doppelpunkt ist nicht erlaubt.");
  try { new Intl.DateTimeFormat("en", { timeZone: output.timezone }); }
  catch { invalid("timezone", "Gültige IANA-Zeitzone erforderlich."); }
  for (const field of ["active_instance", "automatic_check_enabled", "import_existing_database"]) {
    if (typeof value[field] !== "boolean") invalid(field, "true oder false erforderlich.");
    output[field] = value[field];
  }
  for (const [field, min, max] of [
    ["automatic_check_interval_minutes", 15, 10080],
    ["automatic_past_months", 0, 12], ["automatic_future_months", 0, 24],
  ]) {
    if (!Number.isInteger(value[field]) || value[field] < min || value[field] > max) {
      invalid(field, `Ganzzahl zwischen ${min} und ${max} erforderlich.`);
    }
    output[field] = value[field];
  }
  if (typeof value.public_base_url !== "string") invalid("public_base_url", "URL oder leerer Text erforderlich.");
  const base = value.public_base_url.trim();
  if (base) {
    let url;
    try { url = new URL(base); } catch { invalid("public_base_url", "Ungültige URL."); }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
        !(url.protocol === "https:" || (url.protocol === "http:" && loopback))) {
      invalid("public_base_url", "HTTPS-Ursprung ohne Pfad/Zugangsdaten erforderlich; HTTP nur auf localhost.");
    }
    output.public_base_url = url.origin;
  } else output.public_base_url = "";
  // Unknown options (including attempts to disable auth or change the source) are not forwarded.
  return output;
}

export function assertActive(options) {
  if (!options.active_instance) {
    throw new ConfigurationError("Start gesperrt: Zuerst die bisherige Sync-Instanz stoppen, dann active_instance in HA bestätigen. Es darf nur eine Instanz denselben Kalender verwalten.");
  }
}

export function environmentFor(options, { dataDirectory, secretFiles }) {
  return {
    GODO_BASE_URL: "https://goon.asb-bw.de",
    GODO_EMPLOYEE_FILTER: "nur mit gleichem Dienst",
    GODO_USERNAME_FILE: secretFiles.username,
    GODO_PASSWORD_FILE: secretFiles.password,
    APP_PASSWORD_FILE: secretFiles.appPassword,
    APP_USERNAME: options.app_username,
    APP_AUTH_DISABLED: "false",
    DATA_DIR: dataDirectory,
    PORT: "8080", TZ: options.timezone, BROWSER_HEADLESS: "true",
    PUBLIC_BASE_URL: options.public_base_url,
    AUTOMATIC_CHECK_ENABLED: String(options.automatic_check_enabled),
    AUTOMATIC_CHECK_INTERVAL_MINUTES: String(options.automatic_check_interval_minutes),
    AUTOMATIC_PAST_MONTHS: String(options.automatic_past_months),
    AUTOMATIC_FUTURE_MONTHS: String(options.automatic_future_months),
    CALENDAR_SYNC_INTERVAL_MINUTES: String(options.automatic_check_interval_minutes),
  };
}
