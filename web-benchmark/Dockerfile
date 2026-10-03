FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS dependencies
WORKDIR /opt/benchmark
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
FROM dependencies AS runtime
COPY src ./src
RUN mkdir -p /opt/benchmark/fixtures && chown -R node:node /opt/benchmark/fixtures
USER node
CMD ["node", "src/app.mjs"]

FROM runtime AS executor
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl git rsync imagemagick ffmpeg libxml2-utils xsltproc python3-lxml && rm -rf /var/lib/apt/lists/*
USER node
CMD ["node", "src/executor.mjs"]

FROM dependencies AS verify
USER root
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates libnss3-tools && rm -rf /var/lib/apt/lists/*
COPY src ./src
COPY tests ./tests
RUN mkdir -p /home/node/.pki/nssdb && certutil -N -d sql:/home/node/.pki/nssdb --empty-password && certutil -A -d sql:/home/node/.pki/nssdb -n benchmark-local-fixture -t "C,," -i src/tls/local.crt && chown -R node:node /home/node/.pki
ENV NODE_EXTRA_CA_CERTS=/opt/benchmark/src/tls/local.crt
USER node
CMD ["sh", "-c", "node --test --test-reporter=tap --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=artifacts/unit-tests.tap tests/measurement.mjs tests/runner-*.mjs tests/evaluation*.mjs && node tests/acceptance.mjs"]

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS ldap
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends slapd ldap-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/benchmark
COPY src/ldap ./src/ldap
USER node
CMD ["sh", "src/ldap/start.sh"]
