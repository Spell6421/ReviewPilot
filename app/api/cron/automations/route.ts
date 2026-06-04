import { runAutomations } from "@/lib/automations/run";

/**
 * Automation cron endpoint. In production a Vercel Cron job (see vercel.json)
 * GETs this once a day; Vercel attaches `Authorization: Bearer ${CRON_SECRET}`
 * automatically when that env var is set. Locally you trigger the exact same
 * run by hand:
 *
 *   curl -X POST http://localhost:3000/api/cron/automations \
 *     -H "Authorization: Bearer <your CRON_SECRET>"
 *
 * Both verbs share one handler, so "pretend the cron just fired" === the real
 * thing. Fails closed: with no CRON_SECRET configured, every call is rejected.
 */

export const dynamic = "force-dynamic"; // never prerender/cache — it sends messages

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/automations] CRON_SECRET is not set — rejecting all calls.");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runAutomations();
    return Response.json({ ok: true, ranAt: new Date().toISOString(), ...summary });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/automations] run failed:", error);
    return Response.json({ ok: false, error }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
