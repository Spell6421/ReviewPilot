"use server";

import { MAX_RATING, MIN_RATING } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";

/**
 * Public, token-gated feedback actions for the rating page. No auth: the
 * unguessable token IS the credential, so we look the row up by token only.
 * Called imperatively from the client form (not via useActionState).
 */

export type FeedbackActionResult = { ok: true } | { ok: false; error: string };

/**
 * Record the star rating. Idempotent: once a row has a rating we keep the first
 * one (a re-visit or double-tap can't overwrite it).
 */
export async function rateFeedback(
  token: string,
  rating: number,
): Promise<FeedbackActionResult> {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    return { ok: false, error: "Invalid rating." };
  }
  const feedback = await prisma.feedback.findUnique({ where: { token } });
  if (!feedback) return { ok: false, error: "This link is no longer valid." };
  if (feedback.rating != null) return { ok: true }; // already rated — keep it

  await prisma.feedback.update({
    where: { token },
    data: { rating, submittedAt: new Date() },
  });
  return { ok: true };
}

/**
 * Attach the private comment a low-rating customer leaves. Routes to the owner's
 * inbox; never shown publicly.
 */
export async function commentFeedback(
  token: string,
  comment: string,
): Promise<FeedbackActionResult> {
  const text = comment.trim();
  const feedback = await prisma.feedback.findUnique({ where: { token } });
  if (!feedback) return { ok: false, error: "This link is no longer valid." };

  await prisma.feedback.update({
    where: { token },
    data: { comment: text || null },
  });
  return { ok: true };
}
