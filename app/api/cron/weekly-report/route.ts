import { log } from "@/lib/log";
import { persistWeeklyReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * Vercel cron target — runs Monday 09:00 UTC (see vercel.json).
 *
 * Auth: when CRON_SECRET is set (production), Vercel injects
 * `Authorization: Bearer <secret>` on every cron invocation. We validate it
 * here so the endpoint cannot be triggered by unauthenticated callers.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      log.warn("cron.weekly_report.unauthorized", { auth: auth ?? "missing" });
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const row = await persistWeeklyReport("weekly-cron");
    log.info("cron.weekly_report.success", { id: row.id, title: row.title });
    return Response.json({ ok: true, id: row.id });
  } catch (err) {
    log.error("cron.weekly_report.failed", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
