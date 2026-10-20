import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { writeSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PinnedAgent, forwardRequest } from "../../goon_calendar_sync/ha/login-transport.mjs";

export async function startBrowserProxy({ identity, expected, targetHost, port = 8080, bridgePort = 8090 }) {
  const agent = new PinnedAgent(identity, Buffer.isBuffer(expected) ? expected : Buffer.from(expected, "base64"));
  const server = createServer({ maxHeaderSize: 16_384 }, (request, response) => forwardRequest(request, response,
    { host: targetHost, port: bridgePort, tls: true, agent, loopbackPort: port }));
  server.maxConnections = 32; server.headersTimeout = 15_000; server.requestTimeout = 120_000;
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("upgrade", (_request, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); }); });
  return { server, close: () => new Promise(resolve => { agent.destroy(); server.closeAllConnections(); server.close(resolve); }) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let proxy, timer;
  try {
    const config = JSON.parse(await readFile(process.env.GOON_LOGIN_RUNTIME_FILE, "utf8"));
    proxy = await startBrowserProxy(config);
    // S6 readiness: the desktop must not start before its loopback endpoint exists.
    writeSync(3, "\n");
    timer = setTimeout(() => { process.kill(1, "SIGTERM"); }, Math.max(1, config.expiresAt - Date.now()));
    const stop = async () => { clearTimeout(timer); await proxy.close(); process.exit(0); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
  } catch { clearTimeout(timer); await proxy?.close().catch(() => {}); process.stderr.write("Geschützter Browser-Tunnel konnte nicht starten.\n"); process.exitCode = 1; }
}
