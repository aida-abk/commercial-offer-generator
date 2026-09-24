#!/bin/sh
set -e

# Том может быть пустым при первом запуске — создаём схему базы.
mkdir -p "${DATA_DIR:-/data}"
npx prisma db push --skip-generate

# Railway передаёт порт через $PORT.
exec npx next start -p "${PORT:-3000}" -H 0.0.0.0
