FROM mcr.microsoft.com/playwright:v1.62.1-noble AS node-runtime
FROM docker.io/linuxserver/firefox@sha256:19dc07ce33ca47db941d00fa31671be89ceca5b958de5e9647f87184621cb41c

COPY --from=node-runtime /usr/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/share/doc/nodejs/copyright /usr/share/doc/goon-node-copyright
COPY goon_calendar_sync/ha/login-transport.mjs /app/goon_calendar_sync/ha/login-transport.mjs
COPY goon_google_login/ha /app/goon_google_login/ha
COPY goon_google_login/root /
RUN node -e 'const fs=require("node:fs"),p="/defaults/default.conf",parts=fs.readFileSync(p,"utf8").split(/^server \{/m);if(parts.length!==3)throw Error("Unexpected nginx template");fs.writeFileSync(p,"server {"+parts[2]);' \
    && chmod 755 /etc/s6-overlay/s6-rc.d/svc-goon-proxy/run /custom-cont-init.d/99-goon-private-tls

ARG BUILD_VERSION=0.3.0-browser
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="amd64" \
      org.opencontainers.image.source="https://github.com/Tisor1902/home-assistant-apps" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.component="google-login-browser"

ENTRYPOINT ["/bin/sh", "/app/goon_google_login/ha/entrypoint.sh"]
CMD []
