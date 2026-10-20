import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

const version = JSON.parse(readFileSync(new URL("../goon_calendar_sync/config.json", import.meta.url))).version;
const image = process.argv[2] || `goon-ha:${version}`;
const previousImage = process.argv[3] || null;
const directory = mkdtempSync(join(tmpdir(), "goon-ha-smoke-"));
const data = join(directory, "data"), config = join(directory, "config");
mkdirSync(data, { mode: 0o700 });
mkdirSync(config, { mode: 0o700 });
const options = {
  godo_username: "synthetic-user", godo_password: randomBytes(24).toString("hex"),
  // Intentionally below the former 12-character minimum: exercise real login.
  app_username: "admin", app_password: randomBytes(4).toString("hex"),
  active_instance: false, automatic_check_enabled: false,
};
const prefix = `goon-ha-smoke-${randomBytes(6).toString("hex")}`;
const owned = new Set();
const docker = (args, input) => execFileSync("docker", args, {
  input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 45_000, maxBuffer: 4 * 1024 * 1024,
});
function writeOptions() {
  // Supervisor owns /data as root. Reproduce that ownership with generated fixtures only.
  docker(["run", "--rm", "--network", "none", "--entrypoint", "node", "-i", "-v", `${data}:/data`, image, "--input-type=module", "-e",
    "import{chownSync,writeFileSync,readFileSync}from'node:fs';chownSync('/data',0,0);writeFileSync('/data/options.json',readFileSync(0),{mode:0o600});"], JSON.stringify(options));
}
function create(suffix) {
  const name = `${prefix}-${suffix}`;
  docker(["create", "--name", name, "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true", "--init", "--memory", "1g",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=512m", "-v", `${data}:/data`, "-v", `${config}:/config:ro`, image]);
  owned.add(name);
  return name;
}
function inContainer(name, code) { return docker(["exec", "-i", name, "node", "--input-type=module"], code); }
const legacyDigest = `
  import {ChangeStore} from '/app/src/store.mjs';
  import {createHash} from 'node:crypto';
  const store=new ChangeStore('/data/godo-sync.sqlite');
  try {
    const target=store.getCalendarTarget(1);
    const state={marker:store.getPrivateSetting('synthetic-upgrade-marker'),
      target:{id:target.id,provider:target.provider,name:target.name,enabled:target.enabled,calendarId:target.config.calendarId,secret:target.secret},
      links:store.listCalendarEventLinks(1),address:store.shiftAddressMap().get('W1N'),
      events:store.listEvents().filter(event=>event.sourceKey==='synthetic:2030-01-02:0').map(({sourceKey,payload})=>({sourceKey,day:payload.day,shortName:payload.shortName,start:payload.start,end:payload.end}))};
    console.log(createHash('sha256').update(JSON.stringify(state)).digest('hex'));
  } finally {store.close();}
`;
async function healthy(name) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      inContainer(name, "const r=await fetch('http://127.0.0.1:8080/health'); if(!r.ok) process.exit(1);");
      return;
    } catch { await setTimeout(250); }
  }
  throw new Error("health");
}
let stage = "preparation";
let beforeUpgrade;
try {
  writeOptions();
  if (previousImage) {
    stage = "seed-published-previous-version";
    docker(["run", "--rm", "--network", "none", "--entrypoint", "node", "-i", "-v", `${data}:/data`, previousImage, "--input-type=module"], `
      import assert from 'node:assert/strict';
      import {ChangeStore} from '/app/src/store.mjs';
      import {HOME_PROOF_VERSION} from '/app/src/personal-payload.mjs';
      const store=new ChangeStore('/data/godo-sync.sqlite');
      try {
        store.setPrivateSetting('synthetic-upgrade-marker',{value:'synthetic-private-setting'});
        store.setShiftAddress('W1N','Synthetische Wache 1');
        const payload={day:'2030-01-02',shortName:'W1N',category:'shift',allDay:false,start:'2030-01-02T18:00:00Z',end:'2030-01-03T06:00:00Z',coworkers:[]};
        store.recordMonthVerification('2030-01',{version:HOME_PROOF_VERSION,status:'passed',legendHash:'b'.repeat(64),issues:[],notes:[],
          homeCheck:{status:'complete',hash:'a'.repeat(64),legendHash:'b'.repeat(64),attempt:1,personalDays:31,entryCount:31,startedAt:'2030-01-01T09:59:00Z',completedAt:'2030-01-01T10:00:00Z'}});
        store.detect({month:'2030-01',diagnostics:{},events:[{sourceKey:'synthetic:2030-01-02:0',hash:JSON.stringify(payload),payload}]});
        store.decideAll('2030-01');
        assert.equal(store.listEvents().length,1);
        const id=store.createCalendarTarget({provider:'google',name:'Synthetischer bestehender Kalender',enabled:false,
          config:{calendarId:'synthetic-calendar@example.invalid'},secret:{refreshToken:'synthetic-refresh-token-never-send'}});
        assert.equal(id,1);
        store.upsertCalendarEventLink(id,{sourceKey:'synthetic:2030-01-02:0',remoteId:'synthetic-existing-remote-id',payloadHash:'synthetic-existing-hash'});
      } finally {store.close();}
    `);
    beforeUpgrade = docker(["run", "--rm", "--network", "none", "--entrypoint", "node", "-i", "-v", `${data}:/data`, previousImage, "--input-type=module"], legacyDigest).trim();
    assert.match(beforeUpgrade,/^[a-f0-9]{64}$/);
  }
  stage = "inactive-start-guard";
  const blocked = create("blocked");
  let blockedOutput;
  try { blockedOutput = docker(["start", "-a", blocked]); }
  catch (error) { blockedOutput = String(error.stdout || "") + String(error.stderr || ""); }
  assert.match(blockedOutput, /Start gesperrt/);
  if (!previousImage) docker(["run", "--rm", "--network", "none", "--entrypoint", "node", "-v", `${data}:/data:ro`, image, "-e",
    "if(require('node:fs').existsSync('/data/godo-sync.sqlite'))process.exit(1)"]);
  else assert.equal(docker(["run", "--rm", "--network", "none", "--entrypoint", "node", "-i", "-v", `${data}:/data`, previousImage, "--input-type=module"], legacyDigest).trim(),beforeUpgrade);
  assert.equal(docker(["inspect", "--format", "{{.State.ExitCode}}", blocked]).trim(), "1");
  docker(["rm", blocked]); owned.delete(blocked);

  stage = "authenticated-start";
  options.active_instance = true;
  writeOptions();
  const running = create("running");
  docker(["start", running]);
  await healthy(running);
  const security = JSON.parse(docker(["inspect", "--format", "{{json .HostConfig}}", running]));
  assert.equal(security.NetworkMode, "none");
  assert.equal(security.ShmSize, 67108864);
  assert.equal(security.ReadonlyRootfs, true);
  if (previousImage) {
    stage = "legacy-data-preserved";
    assert.equal(inContainer(running,legacyDigest).trim(),beforeUpgrade);
  }

  stage = "http-and-browser";
  inContainer(running, `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { chromium } from '/app/node_modules/playwright/index.mjs';
    const options=JSON.parse(await readFile('/data/options.json','utf8'));
    const base='http://127.0.0.1:8080';
    assert.equal((await fetch(base+'/api/state')).status,401);
    const authorization='Basic '+Buffer.from(options.app_username+':'+options.app_password).toString('base64');
    const stateResponse=await fetch(base+'/api/state',{headers:{authorization}});
    assert.equal(stateResponse.status,200);
    const state=await stateResponse.json();
    assert.equal(state.calendar.googleLogin.mode,'direct');
    assert.equal(state.calendar.googleLogin.browserUrl,null);
    assert.ok(Array.isArray(state.importedEvents));
    assert.ok(Array.isArray(state.notifications.channels));
    const browser=await chromium.launch({headless:true});
    try {
      const context=await browser.newContext();
      const page=await context.newPage();
      await page.goto(base);
      await page.locator('input[name="username"]').fill(options.app_username);
      await page.locator('input[name="password"]').fill(options.app_password);
      await page.locator('button[type="submit"]').click();
      await page.locator('#dutyOverview').waitFor({state:'attached'});
      const changed=await page.evaluate(async()=>{
        const r=await fetch('/api/automation',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'enabled=false&intervalMinutes=321'});
        return {status:r.status,body:await r.json()};
      });
      assert.equal(changed.status,200);
      assert.equal(changed.body.intervalMinutes,321);
      await page.locator('#notifications').waitFor({state:'attached'});
      const added=await page.evaluate(async()=>{
        const post=async(path,input)=>{const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});return {status:r.status,body:await r.json()}};
        const imported=await post('/api/imported-events/import',{files:[{filename:'synthetic.ics',ics:'BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nPRODID:-//Synthetic HA test//EN\\r\\nBEGIN:VEVENT\\r\\nUID:synthetic-ha-ics@example.invalid\\r\\nDTSTAMP:20300101T080000Z\\r\\nDTSTART:20300115T080000Z\\r\\nDTEND:20300115T090000Z\\r\\nSUMMARY:Synthetische Fortbildung\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR\\r\\n'}]});
        const notification=await post('/api/notifications/save',{provider:'webhook',name:'Synthetischer deaktivierter Kanal',enabled:false,includeCoworkers:false,events:['changes'],config:{},secret:{url:'https://example.invalid/never-send'}});
        return {imported,notification};
      });
      assert.equal(added.imported.status,200);assert.equal(added.imported.body.imported,1);
      assert.equal(added.notification.status,200);
    } finally {await browser.close();}
  `);
  stage = "persistence-and-shutdown";
  docker(["stop", "--time", "20", running]);
  assert.equal(docker(["inspect", "--format", "{{.State.ExitCode}}", running]).trim(), "0");
  docker(["start", running]);
  await healthy(running);
  inContainer(running, `
    import assert from 'node:assert/strict';
    import {readFile,stat} from 'node:fs/promises';
    const options=JSON.parse(await readFile('/data/options.json','utf8'));
    const authorization='Basic '+Buffer.from(options.app_username+':'+options.app_password).toString('base64');
    const r=await fetch('http://127.0.0.1:8080/api/automation',{headers:{authorization}});
    const setting=await r.json();
    assert.equal(setting.enabled,false);assert.equal(setting.intervalMinutes,321);assert.equal(setting.source,'ui');
    const state=await fetch('http://127.0.0.1:8080/api/state',{headers:{authorization}}).then(r=>r.json());
    assert.equal(state.importedEvents.length,1);assert.equal(state.importedEvents[0].payload.displayName,'Synthetische Fortbildung');
    assert.equal(state.notifications.channels.length,1);assert.equal(state.notifications.channels[0].enabled,false);
    assert.ok(!JSON.stringify(state).includes('https://example.invalid/never-send'));
    assert.equal((await stat('/data/godo-sync.sqlite')).mode&0o777,0o600);
  `);
  if (previousImage) assert.equal(inContainer(running,legacyDigest).trim(),beforeUpgrade);
  stage = "secret-free-logs";
  const logResult = spawnSync("docker", ["logs", running], { encoding: "utf8", timeout: 10000 });
  assert.equal(logResult.status, 0);
  const logs = logResult.stdout + logResult.stderr;
  for (const secret of [options.godo_password, options.app_password]) assert.ok(!logs.includes(secret));
  docker(["stop", "--time", "20", running]);
  const checks = [
    "inactive-start-guard", "health", "HTTP-401", "Chromium-64MiB-shm",
    "dashboard", "UI-setting-persistence", "private-database", "graceful-shutdown",
    "secret-free-logs", "ICS-import-persistence", "notification-persistence", "HA-direct-OAuth-mode",
    ...(previousImage ? ["upgrade-from-published-image", "legacy-settings-addresses-duties-tokens-links-preserved"] : []),
  ];
  process.stdout.write(JSON.stringify({ result: "passed", checks, network: "none", realCredentials: false }) + "\n");
} catch (error) {
  // Only generated fixtures are used. Redact them even from diagnostic exception messages.
  const reason = String(error.message || error.name).replaceAll(options.godo_password, '[REDACTED]').replaceAll(options.app_password, '[REDACTED]');
  process.stderr.write(`HA-Container-Test fehlgeschlagen: ${stage}. Keine echten Zugangsdaten verwendet. ${reason}\n`);
  process.exitCode = 1;
} finally {
  for (const name of owned) {
    try { docker(["rm", "-f", name]); } catch {}
  }
  try {
    docker(["run", "--rm", "--network", "none", "--entrypoint", "node", "-v", `${data}:/test-data`, image, "-e",
      `const fs=require('node:fs');fs.chownSync('/test-data',${process.getuid()},${process.getgid()});for(const p of fs.readdirSync('/test-data'))fs.chownSync('/test-data/'+p,${process.getuid()},${process.getgid()});`]);
  } catch {}
  try { rmSync(directory, { recursive: true, force: true }); }
  catch { process.stderr.write(`Temporäre synthetische Testdaten verblieben unter ${directory}.\n`); }
}
