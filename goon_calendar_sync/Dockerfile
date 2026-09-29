ARG GOON_IMAGE=ghcr.io/tisor1902/goon-calendar-sync:sha-58f2a07
FROM ${GOON_IMAGE}

ARG BUILD_VERSION=0.1.0
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="amd64" \
      org.opencontainers.image.source="https://github.com/Tisor1902/home-assistant-apps"

COPY ha /app/ha
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/app/ha/entrypoint.mjs"]
