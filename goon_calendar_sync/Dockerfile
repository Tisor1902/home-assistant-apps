FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Public, reviewed snapshot of the application repository. No credentials
# or cross-repository GitHub tokens are needed to reproduce this build.
ADD https://github.com/Tisor1902/home-assistant-apps/releases/download/v0.2.0/goon-ha-local-0.2.0-e17b20d.tar.gz /tmp/goon-source.tar.gz
RUN echo "65d071a333cd16596eabed52292a1c25fb9b7014ba24ce15a7594e00110a4812  /tmp/goon-source.tar.gz" | sha256sum -c - \
    && mkdir /tmp/goon-source \
    && tar -xzf /tmp/goon-source.tar.gz -C /tmp/goon-source \
       goon_calendar_sync/package.json goon_calendar_sync/pnpm-lock.yaml goon_calendar_sync/src \
    && cp /tmp/goon-source/goon_calendar_sync/package.json /tmp/goon-source/goon_calendar_sync/pnpm-lock.yaml /app/ \
    && cp -R /tmp/goon-source/goon_calendar_sync/src /app/src \
    && rm -r /tmp/goon-source /tmp/goon-source.tar.gz \
    && corepack enable && corepack prepare pnpm@11.19.0 --activate \
    && pnpm install --frozen-lockfile --prod

ARG BUILD_VERSION=0.2.0
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="amd64" \
      org.opencontainers.image.source="https://github.com/Tisor1902/home-assistant-apps" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="e17b20d2eb225c7163d85a2cf2b419effdb86773"

COPY ha /app/ha
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/app/ha/entrypoint.mjs"]
