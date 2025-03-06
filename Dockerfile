FROM node:22

RUN apt-get update \
    && apt-get install ffmpeg socat -y --no-install-recommends

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

RUN apt-get update && apt-get install curl gnupg -y \
    && curl --location --silent https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install google-chrome-stable -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*    

WORKDIR /app

COPY ./backend ./backend
COPY ./frontend ./frontend

RUN npm --prefix ./frontend ci
RUN npm --prefix ./backend ci

RUN rm -rf ./frontend/src/ui-kit || true
RUN git clone https://github.com/My-Piper/Piper-UI-Kit.git frontend/src/ui-kit

RUN npm --prefix ./frontend run build

EXPOSE 8080

CMD npm run --prefix ./backend server
