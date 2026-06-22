import { prisma } from "@/lib/db";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

// Liveness + DB-readiness probe. Returns 200 only when Postgres answers; a
// monitor (or Vercel's health checks) can alert on the non-200. Deliberately
// leaks nothing beyond up/down + latency.
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      status: "ok",
      db: "up",
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    log.error("health_db_unreachable", err);
    return Response.json(
      { status: "degraded", db: "down" },
      { status: 503 },
    );
  }
}
