import { existsSync, readFileSync, statSync, writeFileSync, unlinkSync } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Примонтирован ли DATA_DIR как отдельный том, или это папка внутри контейнера. */
function volumeInfo(dataDir: string) {
  if (!existsSync(dataDir)) return { exists: false, mounted: false, writable: false };

  let mounted = false;
  try {
    // В контейнере Linux смонтированные тома перечислены в /proc/mounts.
    const mounts = readFileSync("/proc/mounts", "utf-8");
    mounted = mounts.split("\n").some((line) => line.split(" ")[1] === dataDir);
  } catch {
    mounted = false;
  }

  let writable = false;
  try {
    const probe = path.join(dataDir, ".health-probe");
    writeFileSync(probe, String(Date.now()));
    unlinkSync(probe);
    writable = true;
  } catch {
    writable = false;
  }

  return { exists: true, mounted, writable };
}

/**
 * Служебная страница для диагностики простоев: показывает, сколько сервис живёт
 * с последнего старта (перезапускался ли он), сколько осталось памяти и виден ли
 * диск с данными. Открыта без пароля — иначе ею нельзя пользоваться для проверки.
 */
export async function GET() {
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "config");
  const dbFile = (process.env.DATABASE_URL ?? "").replace(/^file:/, "");

  const uptimeSeconds = Math.round(process.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  let dbSizeKb: number | null = null;
  try {
    if (dbFile && existsSync(dbFile)) dbSizeKb = Math.round(statSync(dbFile).size / 1024);
  } catch {
    dbSizeKb = null;
  }

  return NextResponse.json({
    ok: true,
    startedAgo: `${hours} ч ${minutes} мин`,
    uptimeSeconds,
    memory: {
      usedMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      totalMb: Math.round(os.totalmem() / 1024 / 1024),
      freeMb: Math.round(os.freemem() / 1024 / 1024),
    },
    data: { dir: dataDir, ...volumeInfo(dataDir), dbSizeKb },
    now: new Date().toISOString(),
  });
}
