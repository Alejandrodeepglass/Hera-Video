# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
# Optional BuildKit secrets support restricted cloud builders without storing
# proxy credentials or private certificate authorities in image layers.
RUN --mount=type=secret,id=build_proxy --mount=type=secret,id=build_ca,mode=0444 \
    set -eu; \
    if [ -f /run/secrets/build_proxy ]; then export https_proxy="$(cat /run/secrets/build_proxy)"; export http_proxy="$https_proxy"; fi; \
    sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources; \
    if [ -f /run/secrets/build_ca ]; then printf 'Acquire::https::CaInfo "/run/secrets/build_ca";\n' > /etc/apt/apt.conf.d/99build-ca; fi; \
    apt-get update -o APT::Update::Error-Mode=any; \
    apt-get install -y --no-install-recommends chromium ffmpeg fonts-dejavu-core ca-certificates gosu; \
    rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99build-ca
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=build_proxy --mount=type=secret,id=build_ca,mode=0444 \
    set -eu; \
    if [ -f /run/secrets/build_proxy ]; then export HTTPS_PROXY="$(cat /run/secrets/build_proxy)"; export HTTP_PROXY="$HTTPS_PROXY"; fi; \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build && mkdir -p /app/data && chmod 755 /app/scripts/docker-entrypoint.sh && chown -R node:node /app
USER root
ENV HOST=0.0.0.0 PORT=3000 CHROME_PATH=/usr/bin/chromium DATA_DIR=/app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["npm","start"]
