FROM node:22

ENV MIGRATE_VERSION=v4.18.3 \
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

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
  && curl --location --silent https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
  google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ./backend/package-lock.json ./backend/package-lock.json
COPY ./backend/package.json ./backend/package.json
COPY ./frontend/package-lock.json ./frontend/package-lock.json
COPY ./frontend/package.json ./frontend/package.json

RUN npm --prefix ./backend ci \
  && npm --prefix ./frontend ci

COPY ./backend ./backend
COPY ./frontend ./frontend
COPY ./devops/docker/Makefile ./backend/Makefile

RUN npm --prefix ./frontend run build

WORKDIR /app/backend

VOLUME /var/packages

ENTRYPOINT ["make"]
