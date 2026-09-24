# Образ для Railway / любого сервера с Docker.
# Chromium ставится системным пакетом: pdf.js рендерит листы проекта в настоящем
# браузере, нативные canvas-биндинги в Node для этого не годятся.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DATA_DIR=/data \
    DATABASE_URL=file:/data/offers.db

# Шрифты обязательны: без них кириллица в PDF и на рендере листов превращается
# в квадраты.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-core \
      ca-certificates \
      openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
# devDependencies нужны для сборки Next и типов.
RUN npm ci --include=dev

COPY . .
RUN npx prisma generate && npm run build

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
