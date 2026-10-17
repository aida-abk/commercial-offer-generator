#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

# База обязана лежать на томе. Если переменная окружения указывает куда-то ещё
# (или не задана), Prisma пишет файл внутрь контейнера — и все КП исчезают при
# следующем деплое. Поэтому путь здесь принудительно приводится к тому.
case "$DATABASE_URL" in
  "file:$DATA_DIR"/*)
    ;;
  *)
    echo "ВНИМАНИЕ: DATABASE_URL='$DATABASE_URL' не указывает на том $DATA_DIR."
    echo "Переключаю базу на file:$DATA_DIR/offers.db, иначе данные не переживут деплой."
    DATABASE_URL="file:$DATA_DIR/offers.db"
    export DATABASE_URL
    ;;
esac

echo "База данных: $DATABASE_URL"
npx prisma db push --skip-generate

# Railway передаёт порт через $PORT.
exec npx next start -p "${PORT:-3000}" -H 0.0.0.0
