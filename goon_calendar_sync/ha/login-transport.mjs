import { createPrivateKey, createPublicKey, hkdfSync, timingSafeEqual, X509Certificate } from "node:crypto";
import { spawn } from "node:child_process";
import { Agent, request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { connect } from "node:tls";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function pairingKey(value) {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("Kopplungsschlüssel muss ein lokal erzeugter Schlüssel mit 64 Hex-Zeichen sein.");
  }
  return value.toLowerCase();
}

function identityKey(secret, role) {
  if (!["app", "browser"].includes(role)) throw new Error("Ungültige Verbindungsrolle.");
  const seed = Buffer.from(hkdfSync("sha256", Buffer.from(pairingKey(secret), "hex"), "goon-ha-login", `v1/${role}`, 32));
  // RFC 8410 PKCS#8 Ed25519 seed; each TLS role gets a separate HKDF context.
  return createPrivateKey({ format: "der", type: "pkcs8", key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]) });
}

export function identityPublicKey(secret, role) {
  return createPublicKey(identityKey(secret, role)).export({ format: "der", type: "spki" });
}

export async function createIdentity(secret, role) {
  const key = identityKey(secret, role).export({ format: "pem", type: "pkcs8" });
  const directory = await mkdtemp(join(tmpdir(), "goon-browser-tls-"));
  try {
    const keyFile = join(directory, "identity.pem");
    await writeFile(keyFile, key, { mode: 0o600, flag: "wx" });
    const cert = await new Promise((resolve, reject) => {
      const child = spawn("openssl", ["req", "-new", "-x509", "-key", keyFile, "-days", "3650", "-subj", `/CN=goon-login-${role}`], { stdio: ["ignore", "pipe", "ignore"] });
      const parts = []; let bytes = 0;
      const failed = () => reject(new Error("Geschützte Browser-Verbindung konnte nicht vorbereitet werden."));
      const timer = setTimeout(() => { child.kill("SIGKILL"); failed(); }, 10_000);
      child.on("error", () => { clearTimeout(timer); failed(); });
      child.stdout.on("data", part => { bytes += part.length; if (bytes > 65_536) child.kill("SIGKILL"); else parts.push(part); });
      child.on("close", code => { clearTimeout(timer); if (code !== 0 || bytes > 65_536) failed(); else resolve(Buffer.concat(parts).toString("utf8")); });
    });
    return { key, cert };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export function peerMatches(socket, expected) {
  try {
    const certificate = new X509Certificate(socket.getPeerCertificate().raw);
    const actual = certificate.publicKey.export({ format: "der", type: "spki" });
    const now = Date.now();
    return now >= Date.parse(certificate.validFrom) && now <= Date.parse(certificate.validTo) &&
      actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

export class PinnedAgent extends Agent {
  constructor(identity, expected) { super({ keepAlive: false, maxSockets: 16 }); this.identity = identity; this.expected = expected; }
  createConnection(options, callback) {
    // This private mTLS channel trusts a paired public key, not public web CAs.
    // The HTTP agent receives the socket ONLY after the pin has been verified.
    const socket = connect({ ...options, ...this.identity, rejectUnauthorized: false, minVersion: "TLSv1.3" });
    let delivered = false;
    const fail = () => { if (!delivered) { delivered = true; callback(new Error("Geschützte Browser-Verbindung nicht verfügbar.")); } socket.destroy(); };
    socket.setTimeout(45_000, fail);
    socket.once("error", fail);
    socket.once("secureConnect", () => {
      if (!peerMatches(socket, this.expected)) return fail();
      delivered = true;
      socket.removeListener("error", fail);
      socket.setTimeout(0);
      callback(null, socket);
    });
    // Do not return the unverified socket: HTTPS must not send a request early.
  }
}

const hopHeaders = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "forwarded"];
function cleanHeaders(input) {
  const headers = { ...input };
  const connection = String(headers.connection || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  for (const key of [...hopHeaders, ...connection, ...Object.keys(headers).filter(key => key.startsWith("x-forwarded-"))]) delete headers[key];
  return headers;
}

export function forwardRequest(request, response, { host, port, tls = false, agent = false, loopbackPort = 8080 }) {
  if (!request.url?.startsWith("/") || request.url.startsWith("//") || request.url.length > 8192 || ["CONNECT", "TRACE"].includes(request.method)) {
    request.resume(); response.writeHead(400); response.end("Ungültige Anfrage."); return;
  }
  const headers = { ...cleanHeaders(request.headers), host: `127.0.0.1:${loopbackPort}` };
  let outgoing;
  const failed = () => {
    outgoing?.destroy();
    if (!response.headersSent) { response.writeHead(502, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); response.end("Dienstplan-Verbindung nicht verfügbar. App-Start und Kopplung prüfen."); }
    else response.destroy();
  };
  try {
    outgoing = (tls ? httpsRequest : httpRequest)({ host, port, method: request.method, path: request.url, headers, agent, timeout: 45_000 }, incoming => {
      response.writeHead(incoming.statusCode, { ...cleanHeaders(incoming.headers), "cache-control": "no-store", "referrer-policy": "no-referrer" });
      incoming.on("error", failed); incoming.pipe(response);
    });
    outgoing.on("timeout", failed); outgoing.on("error", failed);
    request.on("aborted", () => outgoing.destroy());
    request.on("error", failed);
    response.on("close", () => outgoing.destroy());
    request.pipe(outgoing);
  } catch { failed(); }
}
