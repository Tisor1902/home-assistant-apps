import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const version = JSON.parse(readFileSync(new URL("../goon_calendar_sync/config.json", import.meta.url))).version;
const appImage = process.argv[2] || `goon-ha:${version}`;
const browserImage = process.argv[3] || `goon-ha:${version}-browser`;
const directory = mkdtempSync(join(tmpdir(), "goon-ha-browser-smoke-"));
const appData = join(directory, "app"), browserData = join(directory, "browser");
mkdirSync(appData, { mode: 0o700 }); mkdirSync(browserData, { mode: 0o700 });
const prefix = `goon-browser-smoke-${randomBytes(5).toString("hex")}`;
const app = prefix + "-app", browser = prefix + "-browser", network = prefix + "-network";
const owned = new Set(); let networkCreated = false, stage = "preparation";
const secret = randomBytes(32).toString("hex"), password = randomBytes(8).toString("hex");
const appOptions = { godo_username: "synthetic", godo_password: randomBytes(16).toString("hex"), app_username: "admin", app_password: password,
  active_instance: true, automatic_check_enabled: false, google_login_browser_enabled: true, google_login_pairing_key: secret };
const browserOptions = { goon_app_slug: "8eef53e8_goon_calendar_sync", pairing_key: secret,
  browser_origin: `https://${browser}:3001`, browser_username: "login", browser_password: password,
  session_minutes: 5, timezone: "Europe/Berlin" };
const docker = (args, input) => execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
const runNode = (name, code, extra = []) => docker(["exec", ...extra, "--env", "NODE_OPTIONS=", "-i", name, "node", "--input-type=module"], code);
function writeOptions(path, options) {
  docker(["run", "--rm", "--network", "none", "--entrypoint", "node", "-i", "-v", `${path}:/data`, appImage, "--input-type=module", "-e",
    "import{chownSync,writeFileSync,readFileSync}from'node:fs';chownSync('/data',0,0);writeFileSync('/data/options.json',readFileSync(0),{mode:0o600});"], JSON.stringify(options));
}
async function waitFor(check, attempts = 100) {
  for (let n = 0; n < attempts; n++) { try { if (check()) return; } catch {} await setTimeout(400); }
  throw new Error("Test deadline reached");
}
try {
  writeOptions(appData, appOptions); writeOptions(browserData, browserOptions);
  docker(["network", "create", "--internal", network]); networkCreated = true;
  const fixture = fileURLToPath(new URL("../test/fixtures/mock-google-preload.mjs", import.meta.url));
  docker(["create", "--name", app, "--network", network, "--network-alias", "8eef53e8-goon-calendar-sync", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true", "--memory", "1g", "--tmpfs", "/tmp:rw,nosuid,nodev,size=256m", "-v", `${appData}:/data`,
    "-v", `${fixture}:/fixtures/mock-google.mjs:ro`, "--env", "NODE_OPTIONS=--import=/fixtures/mock-google.mjs", appImage]); owned.add(app);
  docker(["start", app]);
  stage = "core-health-and-real-auth";
  await waitFor(() => runNode(app, "if(!(await fetch('http://127.0.0.1:8080/health')).ok)process.exit(1);") !== null);
  runNode(app, "import assert from'node:assert/strict';assert.equal((await fetch('http://127.0.0.1:8080/api/state')).status,401);");
  stage = "isolated-browser-start";
  docker(["create", "--name", browser, "--network", network, "--security-opt", "no-new-privileges:true",
    "--cap-drop", "NET_RAW", "--cap-drop", "MKNOD", "--cap-drop", "AUDIT_WRITE", "--cap-drop", "SETFCAP", "--memory", "2g",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=768m", "-v", `${browserData}:/data`, browserImage]); owned.add(browser);
  docker(["start", browser]);
  stage = "Firefox-real-cookies-PKCE-callback-renew-existing-target";
  await waitFor(() => {
    const result = JSON.parse(runNode(app, "console.log(JSON.stringify(await fetch('http://127.0.0.1:8080/fixture/result').then(r=>r.json())));").trim());
    if (!result.renewed) return false;
    assert.deepEqual(result, { renewed: true, targetCount: 1, id: 1, calendarPreserved: true, disabledPreserved: true, linksPreserved: true }); return true;
  });
  stage = "GUI-authentication-and-network-isolation";
  runNode(browser, `
    import assert from'node:assert/strict';import{get}from'node:https';import{readFile,readdir}from'node:fs/promises';
    const options=JSON.parse(await readFile('/data/options.json','utf8'));
    const call=authorization=>new Promise((resolve,reject)=>{const r=get({host:'127.0.0.1',port:3001,path:'/',rejectUnauthorized:false,headers:authorization?{authorization}:{}},s=>{s.resume();resolve(s.statusCode)});r.on('error',reject)});
    assert.equal(await call(),401);assert.equal(await call('Basic '+Buffer.from('login:wrong').toString('base64')),401);
    assert.equal(await call('Basic '+Buffer.from(options.browser_username+':'+options.browser_password).toString('base64')),200);
    await assert.rejects(fetch('http://127.0.0.1:3000/'));
    const dirs=await readdir('/tmp');const runtime=dirs.find(p=>p.startsWith('goon-browser-private-'));
    assert.ok(runtime);await import('node:fs/promises').then(fs=>fs.writeFile('/tmp/fixture-runtime-path','/tmp/'+runtime+'/runtime.json'));
    assert.equal(dirs.filter(p=>p.startsWith('goon-browser-profile-')).length,1);
  `);
  runNode(browser, `
    import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
    await assert.rejects(readFile('/data/options.json'));await assert.rejects(readFile('/tmp/fixture-runtime-path').then(p=>readFile(p.toString())));
  `, ["--user", "1000:1000"]);
  runNode(app, `
    import assert from'node:assert/strict';
    for(const port of [8080,8082,3000])await assert.rejects(fetch('http://${browser}:'+port+'/'));
  `);
  stage = "remote-desktop-rendering-and-WebSocket-auth";
  const desktop = JSON.parse(runNode(app, `
    import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
    import{chromium}from'/app/node_modules/playwright/index.mjs';
    const options=JSON.parse(await readFile('/data/options.json','utf8'));
    const client=await chromium.launch({headless:true});
    try{
      const context=await client.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},
        httpCredentials:{username:'login',password:options.app_password}});
      const page=await context.newPage();let frames=0;
      page.on('websocket',socket=>socket.on('framereceived',()=>frames++));
      const response=await page.goto('https://${browser}:3001/',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
      await page.waitForFunction(()=>[...document.querySelectorAll('canvas,video')].some(p=>p.clientWidth>300&&p.clientHeight>200),{},{timeout:30000});
      await page.waitForTimeout(2500);assert.ok(frames>0,'Authenticated desktop WebSocket must receive data');
      await page.screenshot({path:'/tmp/goon-browser-qa.png'});
      console.log(JSON.stringify({rendered:true,authenticatedSocket:true}));
    }finally{await client.close();}
  `).trim());
  assert.equal(desktop.rendered,true); assert.equal(desktop.authenticatedSocket,true);
  if(process.argv[4])writeFileSync(resolve(process.argv[4]),execFileSync('docker',
    ['exec','--env','NODE_OPTIONS=',app,'node','-e',"process.stdout.write(require('node:fs').readFileSync('/tmp/goon-browser-qa.png'))"],
    {stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:8*1024*1024}),{mode:0o600});
  stage = "automatic-session-shutdown";
  runNode(browser, `
    import{readFile,writeFile}from'node:fs/promises';const p=await readFile('/tmp/fixture-runtime-path','utf8');const config=JSON.parse(await readFile(p,'utf8'));config.expiresAt=Date.now()+1500;await writeFile(p,JSON.stringify(config));
  `);
  docker(["exec", browser, "s6-svc", "-r", "/run/service/svc-goon-proxy"]);
  await waitFor(() => docker(["inspect", "--format", "{{.State.Running}}", browser]).trim() === "false", 50);
  assert.equal(docker(["inspect", "--format", "{{.State.ExitCode}}", browser]).trim(), "0");
  assert.equal(docker(["inspect", "--format", "{{.State.Running}}", app]).trim(), "true");
  stage = "temporary-profile-discarded";
  docker(["start", browser]);
  await waitFor(() => runNode(browser, "import{readdir}from'node:fs/promises';if(!(await readdir('/tmp')).some(p=>p.startsWith('goon-browser-profile-')))process.exit(1);") !== null);
  runNode(browser, "import assert from'node:assert/strict';import{existsSync}from'node:fs';assert.equal(existsSync('/tmp/fixture-runtime-path'),false);");
  stage = "logs-and-metadata";
  for (const name of [app, browser]) {
    const logs = spawnSync("docker", ["logs", name], { encoding: "utf8", timeout: 10_000 }); assert.equal(logs.status, 0);
    for (const value of [secret, password, appOptions.godo_password, "synthetic-new-refresh", "synthetic-code"]) assert.ok(!(logs.stdout + logs.stderr).includes(value));
  }
  const metadata = JSON.parse(docker(["inspect", browser]))[0];
  assert.equal(metadata.HostConfig.Privileged, false); assert.equal(metadata.HostConfig.NetworkMode, network);
  assert.deepEqual(metadata.Mounts.filter(p=>p.Type==='bind').map(p=>p.Destination), ["/data"]);
  assert.ok(!JSON.stringify(metadata.Config.Env).includes(secret)); assert.ok(!JSON.stringify(metadata.Config.Env).includes(password));
  process.stdout.write(JSON.stringify({ result: "passed", realCredentials: false, network: "internal-offline",
    checks: ["regular-Firefox", "real-app-auth", "mTLS-separate-containers", "OAuth-cookies-PKCE-loopback-callback", "existing-target-and-links-preserved",
      "HTTPS-GUI-password", "rendered-desktop-and-authenticated-WebSocket", "HTTP-port-closed", "private-options-and-TLS-key", "loopback-and-Selkies-not-exposed", "session-auto-stop", "profile-discard", "secret-free-logs"] }) + "\n");
} catch (error) {
  let message = String(error.message || error.name);
  for (const value of [secret, password, appOptions.godo_password]) message = message.replaceAll(value, "[REDACTED]");
  process.stderr.write(`HA-Anmeldebrowser-Test fehlgeschlagen: ${stage}. Nur Testdaten. ${message}\n`); process.exitCode = 1;
} finally {
  for (const name of owned) try { docker(["rm", "-f", "-v", name]); } catch {}
  if (networkCreated) try { docker(["network", "rm", network]); } catch {}
  for (const path of [appData, browserData]) try {
    docker(["run", "--rm", "--network", "none", "--entrypoint", "node", "-v", `${path}:/test-data`, appImage, "-e",
      `const fs=require('node:fs');fs.chownSync('/test-data',${process.getuid()},${process.getgid()});for(const p of fs.readdirSync('/test-data'))fs.chownSync('/test-data/'+p,${process.getuid()},${process.getgid()});`]);
  } catch {}
  try { rmSync(directory, { recursive: true, force: true }); } catch { process.stderr.write(`Synthetische Testdaten verbleiben unter ${directory}.\n`); }
}
