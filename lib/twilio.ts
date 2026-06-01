import twilio, { validateRequest } from "twilio";

import type { MessageStatus } from "@prisma/client";

/**
 * Thin Twilio SMS wrapper. Server-only — this module reads Twilio secrets from
 * the environment and must never be imported into a client component.
 *
 * The helper never throws: it returns a discriminated result so callers can
 * record a `sent` / `failed` Message row instead of crashing the request. That
 * matters while the Twilio number is still unverified/unregistered, since real
 * sends will often come back as errors during development.
 */

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
// Optional public URL of our status webhook (e.g. https://yourapp.com/api/twilio/status
// or an ngrok URL in dev). When set, Twilio POSTs delivery updates back to it.
const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL;

export type SendSmsResult =
  | { ok: true; sid: string }
  | { ok: false; error: string };

// Lazily build the client so a missing/incomplete config doesn't blow up at
// module load — it just makes sends fail with a friendly message.
let client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (!accountSid || !authToken) return null;
  if (!client) client = twilio(accountSid, authToken);
  return client;
}

/** True when all three Twilio env vars are present. */
export function isSmsConfigured(): boolean {
  return Boolean(accountSid && authToken && fromNumber);
}

/**
 * Send a single SMS. `to` should be E.164 (e.g. +15551234567). Returns the
 * Twilio message SID on success, or a human-readable error on failure.
 */
export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  const c = getClient();
  if (!c || !fromNumber) {
    return {
      ok: false,
      error:
        "SMS isn't configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to .env.local.",
    };
  }

  try {
    const message = await c.messages.create({
      to,
      from: fromNumber,
      body,
      ...(statusCallback ? { statusCallback } : {}),
    });
    return { ok: true, sid: message.sid };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown Twilio error.";
    return { ok: false, error };
  }
}

// Standard carrier opt-out / opt-in keywords. Twilio auto-handles the STOP
// reply at the account level; we mirror the intent in our own data so we stop
// queuing sends to that customer (and let START re-enable them).
const OPT_OUT_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const OPT_IN_KEYWORDS = new Set(["start", "yes", "unstop"]);

/**
 * Classify an inbound SMS body as an opt-out, opt-in, or neither. Matches only
 * when the keyword is the whole message (after trimming), which is how carriers
 * treat these keywords.
 */
export function classifyInboundKeyword(body: string): "opt_out" | "opt_in" | null {
  const word = body.trim().toLowerCase();
  if (OPT_OUT_KEYWORDS.has(word)) return "opt_out";
  if (OPT_IN_KEYWORDS.has(word)) return "opt_in";
  return null;
}

/**
 * Map a Twilio delivery status (from a status-callback webhook) onto our
 * MessageStatus enum. Twilio has more granular states than we track, so we
 * collapse them. Returns null for statuses we don't act on (e.g. inbound).
 */
export function mapTwilioStatus(twilioStatus: string): MessageStatus | null {
  switch (twilioStatus) {
    case "queued":
    case "accepted":
    case "scheduled":
    case "sending":
      return "queued";
    case "sent":
    case "delivered":
      return "sent";
    case "undelivered":
    case "failed":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

/**
 * Reconstruct the public URL Twilio used to reach us. Twilio signs the exact
 * URL (including query string), so behind Vercel's proxy we rebuild it from the
 * forwarded headers rather than trusting the internal `request.url` host.
 */
function reconstructUrl(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) url.host = forwardedHost;
  if (forwardedProto) url.protocol = `${forwardedProto}:`;
  return url.toString();
}

/**
 * Read a Twilio webhook's form-encoded body and validate its signature in one
 * pass (the body can only be consumed once). `valid` is true only when the
 * `X-Twilio-Signature` header matches what our auth token would produce for
 * this URL + params — proof the request genuinely came from Twilio.
 */
export async function parseTwilioWebhook(request: Request): Promise<{
  params: Record<string, string>;
  valid: boolean;
}> {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = typeof value === "string" ? value : "";
  }

  const signature = request.headers.get("x-twilio-signature");
  const url = reconstructUrl(request);
  const valid = Boolean(
    authToken && signature && validateRequest(authToken, signature, url, params),
  );

  return { params, valid };
}
