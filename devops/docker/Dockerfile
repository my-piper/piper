# Node major comes from .nvmrc: CI passes it as a build arg, and
# tools/check-node-version.sh keeps this default in sync for local builds.
ARG NODE_VERSION=26
FROM node:${NODE_VERSION}-trixie

ENV MIGRATE_VERSION=v4.18.3

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  curl \
  gnupg \
  make \
  ffmpeg \
  socat \
  && curl -L https://github.com/golang-migrate/migrate/releases/download/${MIGRATE_VERSION}/migrate.linux-amd64.tar.gz | tar xvz -C /tmp \
  && chmod +x /tmp/migrate \
  && mv /tmp/migrate /usr/local/bin/migrate \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ./backend/package-lock.json ./backend/package-lock.json
COPY ./backend/package.json ./backend/package.json
COPY ./backend/vendor ./backend/vendor
COPY ./frontend/package-lock.json ./frontend/package-lock.json
COPY ./frontend/package.json ./frontend/package.json

RUN npm --prefix ./backend ci \
  && npm --prefix ./frontend ci

COPY ./backend ./backend
COPY ./frontend ./frontend
COPY ./migrations ./migrations
COPY ./devops/docker/Makefile ./backend/Makefile

RUN npm --prefix ./frontend run build

ENV ENV=production \
  NPM_CACHE_DIR=/var/npm-cache

WORKDIR /app/backend

ENTRYPOINT ["make"]
