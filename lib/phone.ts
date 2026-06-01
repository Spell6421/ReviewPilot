/**
 * Normalize a phone number to E.164 (e.g. +15551234567).
 *
 * Twilio requires E.164 for both sending and inbound-reply matching, so we
 * normalize at every entry point (manual add, CSV import, missed leads). Returns
 * null when the input can't be confidently normalized — callers treat that as
 * "no usable phone number".
 *
 * Deliberately dependency-free and US-default: the target market is US local
 * service businesses. If international numbers become a requirement, swap the
 * body for libphonenumber-js — the signature can stay the same.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already in international form: keep the digits after the leading +.
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`; // US 10-digit
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`; // US with country code
  return null; // can't confidently normalize
}
