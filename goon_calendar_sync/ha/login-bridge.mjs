import { createServer } from "node:https";
import { createIdentity, identityPublicKey, peerMatches, forwardRequest } from "./login-transport.mjs";

export async function startLoginBridge({ pairingKey, host = "0.0.0.0", port = 8090, backendPort = 8080 }) {
  const identity = await createIdentity(pairingKey, "app");
  const expected = identityPublicKey(pairingKey, "browser");
  const server = createServer({ ...identity, minVersion: "TLSv1.3", requestCert: true, rejectUnauthorized: false, maxHeaderSize: 16_384 }, (request, response) => {
    // TLS proves possession of the private key; the pin supplies trust for our
    // self-signed identities. Never forward an unpaired request onto loopback.
    if (!peerMatches(request.socket, expected)) { request.resume(); response.writeHead(403); response.end("Nicht autorisiert."); return; }
    forwardRequest(request, response, { host: "127.0.0.1", port: backendPort, loopbackPort: backendPort });
  });
  server.maxConnections = 32;
  server.headersTimeout = 15_000;
  server.requestTimeout = 120_000;
  server.on("tlsClientError", () => {}); // Never log handshake details or request URLs.
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("upgrade", (_request, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => { server.removeListener("error", reject); resolve(); }); });
  return { server, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
