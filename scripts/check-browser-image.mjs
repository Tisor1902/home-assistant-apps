import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const image = process.argv[2];
const docker = args => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024 });
try {
  assert.ok(image);
  const config = JSON.parse(readFileSync(new URL("../goon_google_login/config.json", import.meta.url)));
  const metadata = JSON.parse(docker(["image", "inspect", image]))[0];
  assert.equal(metadata.Architecture, "amd64"); assert.equal(metadata.Config.Labels["io.hass.version"], config.version);
  assert.equal(metadata.Config.Labels["org.opencontainers.image.component"], "google-login-browser");
  assert.ok(!metadata.Config.Env.some(value => /^(?:.*PASSWORD|.*SECRET|.*TOKEN|.*PAIRING_KEY)=.+/.test(value)));
  docker(["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--entrypoint", "node", image, "--input-type=module", "-e", `
    import assert from'node:assert/strict';import{existsSync,readFileSync}from'node:fs';
    for(const p of ['/data/options.json','/data/godo-sync.sqlite','/app/src','/app/.git','/fixtures','/app/test'])assert.equal(existsSync(p),false);
    assert.equal((readFileSync('/defaults/default.conf','utf8').match(/^server \\{/gm)||[]).length,1);
    assert.ok(!/listen 3000/.test(readFileSync('/defaults/default.conf','utf8')));
    for(const p of ['/app/goon_google_login/ha/proxy.mjs','/app/goon_calendar_sync/ha/login-transport.mjs','/etc/s6-overlay/s6-rc.d/svc-de/dependencies.d/svc-goon-proxy'])assert.ok(existsSync(p));
  `]);
  process.stdout.write("Browser-Image-Prüfung bestanden: amd64, Komponentenversion, nur HTTPS-GUI, keine App-Daten oder Test-Fixtures.\n");
} catch {
  process.stderr.write("Browser-Image-Prüfung fehlgeschlagen; mögliche private Werte werden nicht ausgegeben.\n"); process.exitCode = 1;
}
