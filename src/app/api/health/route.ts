import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Лимит памяти контейнера. os.totalmem() внутри контейнера показывает память
 * всего хоста (сотни гигабайт) и для диагностики бесполезен — настоящий предел
 * лежит в cgroup.
 */
function memoryLimitMb(): { limitMb: number | null; usedMb: number } {
  const usedMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const sources = [
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  ];
  for (const file of sources) {
    try {
      const raw = readFileSync(file, "utf-8").trim();
      if (raw === "max") continue;
      const bytes = Number(raw);
      // Нереалистично большое значение означает «без лимита».
      if (Number.isFinite(bytes) && bytes > 0 && bytes < os.totalmem() * 2) {
        return { limitMb: Math.round(bytes / 1024 / 1024), usedMb };
      }
    } catch {
      // файла нет — не Linux или другая версия cgroup
    }
  }
  return { limitMb: null, usedMb };
}

function dataDirInfo(dataDir: string) {
  if (!existsSync(dataDir)) return { exists: false, mounted: false, writable: false, files: [] };

  let mounted = false;
  try {
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

  let files: { name: string; kb: number }[] = [];
  try {
    files = readdirSync(dataDir)
      .filter((name) => !name.startsWith("."))
      .map((name) => {
        try {
          return { name, kb: Math.round(statSync(path.join(dataDir, name)).size / 1024) };
        } catch {
          return { name, kb: 0 };
        }
      });
  } catch {
    files = [];
  }

  return { exists: true, mounted, writable, files };
}

/**
 * Диагностика простоев и потери данных: сколько сервис живёт с последнего
 * старта, упирается ли он в память и — главное — лежит ли база на томе.
 * Открыта без пароля, чтобы доступность можно было проверять снаружи.
 */
export async function GET() {
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "config");
  const dbPath = (process.env.DATABASE_URL ?? "").replace(/^file:/, "");
  const dbResolved = dbPath ? path.resolve(dbPath) : null;
  // Главная проверка: если база не внутри тома, она исчезнет при следующем деплое.
  const dbOnVolume = dbResolved ? dbResolved.startsWith(path.resolve(dataDir) + path.sep) : false;

  let dbSizeKb: number | null = null;
  try {
    if (dbResolved && existsSync(dbResolved)) dbSizeKb = Math.round(statSync(dbResolved).size / 1024);
  } catch {
    dbSizeKb = null;
  }

  const uptimeSeconds = Math.round(process.uptime());
  const memory = memoryLimitMb();

  return NextResponse.json({
    ok: true,
    startedAgo: `${Math.floor(uptimeSeconds / 3600)} ч ${Math.floor((uptimeSeconds % 3600) / 60)} мин`,
    uptimeSeconds,
    memory,
    database: { path: dbResolved, onVolume: dbOnVolume, sizeKb: dbSizeKb },
    data: { dir: dataDir, ...dataDirInfo(dataDir) },
    warnings: [
      ...(dbResolved && !dbOnVolume
        ? ["База лежит вне тома — данные исчезнут при следующем деплое."]
        : []),
      ...(!dbResolved ? ["DATABASE_URL не задан."] : []),
    ],
    now: new Date().toISOString(),
  });
}
