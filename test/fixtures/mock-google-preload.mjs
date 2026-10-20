// TEST ONLY. Mounted only by smoke-login-browser.mjs into an offline test app.
// Never included by either Dockerfile or the release source allowlist.
import http from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { readFileSync } from "node:fs";
import { ChangeStore } from "/app/src/store.mjs";
import { CalendarSyncService } from "/app/src/calendar-sync.mjs";

const options = JSON.parse(readFileSync("/data/options.json", "utf8"));
const openStore = () => new ChangeStore("/data/godo-sync.sqlite");
{
  const store = openStore();
  try {
    if (!store.getPrivateSetting("synthetic-browser-seeded")) {
      const service = new CalendarSyncService({ store });
      service.configureGoogleClient({ clientId: "synthetic.apps.googleusercontent.com", clientSecret: "synthetic-client-secret" });
      const id = store.createCalendarTarget({ provider: "google", name: "Synthetic existing target", enabled: false,
        config: { calendarId: "synthetic@example.invalid", includeCoworkers: true, dedicatedCalendar: true },
        secret: { refreshToken: "synthetic-old-refresh" } });
      store.upsertCalendarEventLink(id, { sourceKey: "synthetic-duty", remoteId: "synthetic-remote", payloadHash: "synthetic-hash" });
      store.setPrivateSetting("synthetic-browser-seeded", { id });
    }
  } finally { store.close(); }
}

globalThis.fetch = async url => {
  const parsed = new URL(String(url));
  if (parsed.origin === "https://oauth2.googleapis.com" && parsed.pathname === "/token") {
    return Response.json({ access_token: "synthetic-new-access", refresh_token: "synthetic-new-refresh", expires_in: 3600 });
  }
  if (parsed.origin === "https://www.googleapis.com") {
    return Response.json({ items: [{ id: "synthetic@example.invalid", summary: "Synthetic duties", accessRole: "owner" }] });
  }
  throw new Error("Offline fixture rejects all other fetches");
};

function result() {
  const store = openStore();
  try {
    const target = store.getCalendarTarget(1);
    return { renewed: target?.secret?.refreshToken === "synthetic-new-refresh", targetCount: store.listCalendarTargets().length,
      id: target?.id, calendarPreserved: target?.config?.calendarId === "synthetic@example.invalid",
      disabledPreserved: target?.enabled === false, linksPreserved: store.listCalendarEventLinks(1)[0]?.remoteId === "synthetic-remote" };
  } finally { store.close(); }
}

const original = http.createServer;
http.createServer = function (...args) {
  const index = args.findIndex(value => typeof value === "function");
  if (index < 0) return original.apply(this, args);
  const handler = args[index];
  args[index] = (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1:8080");
    if (url.pathname === "/fixture/result") {
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(result())); return;
    }
    if (url.pathname === "/fixture/mock-authorize") {
      response.writeHead(303, { location: "/oauth/google/callback?" + new URLSearchParams({ state: url.searchParams.get("state"), code: "synthetic-code" }) });
      response.end(); return;
    }
    if (url.pathname === "/" && !result().renewed) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(`<!doctype html><title>Synthetic HA login test</title><p id="fixture">Offline login test</p><script>
        (async()=>{
          await fetch('/login',{method:'POST',body:new URLSearchParams(${JSON.stringify({ username: options.app_username, password: options.app_password })})});
          const response=await fetch('/api/calendar/google/connect',{method:'POST',body:new URLSearchParams({targetId:'1'})});
          if(!response.ok)throw new Error('connect');
          const url=new URL((await response.json()).authorizationUrl);
          if(url.searchParams.get('redirect_uri')!=='http://127.0.0.1:8080/oauth/google/callback'||!url.searchParams.get('code_challenge'))throw new Error('callback or PKCE');
          location.replace('/fixture/mock-authorize?'+new URLSearchParams({state:url.searchParams.get('state')}));
        })().catch(()=>document.querySelector('#fixture').textContent='Synthetic login failed');
      </script>`); return;
    }
    return handler(request, response);
  };
  return original.apply(this, args);
};
syncBuiltinESMExports();
