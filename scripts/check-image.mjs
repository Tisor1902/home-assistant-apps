import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const image = process.argv[2];
if (!image) throw new Error("Container-Image fehlt.");
const docker = args => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 });
try {
  const metadata = JSON.parse(docker(["image", "inspect", image]))[0];
  const forbidden = /^(?:GODO_USERNAME|GODO_PASSWORD|APP_PASSWORD|GOOGLE_CLIENT_SECRET|GOOGLE_REFRESH_TOKEN|SUPERVISOR_TOKEN|HASSIO_TOKEN|GH_TOKEN|GITHUB_TOKEN|.*_PASSWORD|.*_SECRET|.*_TOKEN)=.+/;
  assert.ok(!metadata.Config.Env.some(value => forbidden.test(value)));
  assert.equal(metadata.Architecture, "amd64");
  assert.equal(metadata.Config.Labels["io.hass.type"], "app");
  docker(["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--entrypoint", "node", image, "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import {existsSync,readdirSync,readFileSync} from 'node:fs';
    for (const path of ['/data/options.json','/data/godo-sync.sqlite','/app/.env','/app/.git','/app/data','/app/secrets','/run/secrets']) assert.equal(existsSync(path),false);
    if(existsSync('/data'))assert.deepEqual(readdirSync('/data'),[]);
    for(const directory of ['/app/src','/app/ha'])for(const name of readdirSync(directory)){
      assert.ok(name.endsWith('.mjs'));
      const content=readFileSync(directory+'/'+name,'utf8');
      for(const pattern of [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\\bgh[pousr]_[A-Za-z0-9]{30,}/,/\\bgithub_pat_[A-Za-z0-9_]{30,}/,/\\bGOCSPX-[A-Za-z0-9_-]{20,}/,/\\bya29\\.[A-Za-z0-9_.-]{25,}/])assert.ok(!pattern.test(content));
    }
  `]);
  process.stdout.write("Image-Prüfung bestanden: amd64, HA-Labels, keine Nutzerdaten oder eingebetteten Zugangsdaten gefunden.\n");
} catch {
  process.stderr.write("Image-Prüfung fehlgeschlagen. Details werden zum Schutz möglicher Secrets nicht ausgegeben.\n");
  process.exitCode = 1;
}
