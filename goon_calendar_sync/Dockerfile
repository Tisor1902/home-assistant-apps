FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Public, reviewed snapshot of the private development repository. No credentials
# or cross-repository GitHub tokens are needed to reproduce this build.
ADD https://github.com/Tisor1902/home-assistant-apps/releases/download/v0.1.0/goon-ha-local-0.1.0-58f2a07.tar.gz /tmp/goon-source.tar.gz
RUN echo "c2a4af2adde32cf52a0f343238c142c6d4eb160c171a4380f7203e2e0be97097  /tmp/goon-source.tar.gz" | sha256sum -c - \
    && mkdir /tmp/goon-source \
    && tar -xzf /tmp/goon-source.tar.gz -C /tmp/goon-source \
       goon_calendar_sync/package.json goon_calendar_sync/pnpm-lock.yaml goon_calendar_sync/src \
    && cp /tmp/goon-source/goon_calendar_sync/package.json /tmp/goon-source/goon_calendar_sync/pnpm-lock.yaml /app/ \
    && cp -R /tmp/goon-source/goon_calendar_sync/src /app/src \
    && rm -r /tmp/goon-source /tmp/goon-source.tar.gz \
    && corepack enable && corepack prepare pnpm@11.19.0 --activate \
    && pnpm install --frozen-lockfile --prod

ARG BUILD_VERSION=0.1.1
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="amd64" \
      org.opencontainers.image.source="https://github.com/Tisor1902/home-assistant-apps" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="58f2a0750808c7b7afd53d5e95b390015bf60c89"

COPY ha /app/ha
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/app/ha/entrypoint.mjs"]
