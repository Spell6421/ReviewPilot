import { Resend } from "resend";

/**
 * Thin Resend email wrapper, mirroring lib/twilio.ts. Server-only — reads the
 * Resend API key from the environment and must never be imported into a client
 * component.
 *
 * Like sendSms, it never throws: it returns a discriminated result so callers
 * can record a `sent` / `failed` Message row instead of crashing the request.
 *
 * `from` defaults to Resend's sandbox sender `onboarding@resend.dev`, which only
 * delivers to the Resend account owner's own email — the email equivalent of
 * Twilio's Virtual Phone, so the channel is testable before a domain is
 * verified. Set RESEND_FROM_EMAIL to a verified-domain address for real sends.
 */

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Lazily build the client so a missing key doesn't blow up at module load.
let client: Resend | null = null;
function getClient() {
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

/** True when the Resend API key is present. */
export function isEmailConfigured(): boolean {
  return Boolean(apiKey);
}

/** Send a single plain-text email. Returns the Resend message id on success. */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<SendEmailResult> {
  const c = getClient();
  if (!c) {
    return {
      ok: false,
      error: "Email isn't configured. Add RESEND_API_KEY to .env.local.",
    };
  }

  try {
    const { data, error } = await c.emails.send({
      from: fromEmail,
      to,
      subject,
      text: body,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? "" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown Resend error.";
    return { ok: false, error };
  }
}
