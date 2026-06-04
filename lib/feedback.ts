import { randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";

/**
 * Feedback-gated review flow helpers.
 *
 * A review_request (or its follow-up) no longer links straight to Google.
 * Instead it links to the public rating page at /feedback/[token], backed by a
 * pending `Feedback` row created here. The customer's star rating decides what
 * that page leads with — but the Google path stays reachable for everyone. The
 * routing is intentionally NON-gating (Google policy + the FTC review-suppression
 * rule); see the `Feedback` model comment in schema.prisma.
 */

/**
 * Ratings at or above this are "positive": the rating page leads with the Google
 * review CTA. Below it, the page leads with the private comment box (Google still
 * offered, just de-emphasized). One shared constant so the page, the inbox query,
 * and the automation dedup never drift.
 */
export const POSITIVE_RATING_THRESHOLD = 4;

/** Valid star values a customer can submit. */
export const MIN_RATING = 1;
export const MAX_RATING = 5;

export function isPositiveRating(rating: number): boolean {
  return rating >= POSITIVE_RATING_THRESHOLD;
}

/** Absolute base URL used to build public links (the feedback page lives here). */
function appBaseUrl(): string {
  // Server-side sends (incl. the unattended cron) have no request to derive a
  // host from, so the base URL must come from the environment.
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function feedbackLinkForToken(token: string): string {
  return `${appBaseUrl()}/feedback/${token}`;
}

export type FeedbackRequest = { token: string; link: string };

/**
 * Create a pending feedback request (rating == null) for a customer and return
 * the public link. Prefer `fillFeedbackLink` below for the send path; call this
 * directly only if you need the token/link without a template body.
 */
export async function createFeedbackRequest(input: {
  businessId: string;
  customerId: string;
}): Promise<FeedbackRequest> {
  // 24 random bytes → 192 bits of entropy, URL-safe, non-enumerable. This token
  // is the only credential the unauthenticated rating page needs.
  const token = randomBytes(24).toString("base64url");

  await prisma.feedback.create({
    data: {
      businessId: input.businessId,
      customerId: input.customerId,
      token,
    },
  });

  return { token, link: feedbackLinkForToken(token) };
}

/** Literal placeholder left in rendered template bodies until send time. */
export const FEEDBACK_LINK_PLACEHOLDER = "{{feedbackLink}}";

/**
 * Substitute {{feedbackLink}} in a message body, minting a fresh feedback request
 * for the customer. Returns the body unchanged (and mints nothing) when the
 * placeholder is absent. Call this at *actual* send time — never in the pure
 * `find*` preview path — so a Feedback row is only ever created for a real send.
 */
export async function fillFeedbackLink(
  body: string,
  ctx: { businessId: string; customerId: string },
): Promise<string> {
  if (!body.includes(FEEDBACK_LINK_PLACEHOLDER)) return body;
  const { link } = await createFeedbackRequest(ctx);
  // split/join avoids relying on String.replaceAll's lib target.
  return body.split(FEEDBACK_LINK_PLACEHOLDER).join(link);
}
