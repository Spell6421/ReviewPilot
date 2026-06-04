"use client";

import { useState } from "react";
import { Star } from "lucide-react";

import { commentFeedback, rateFeedback } from "@/app/feedback/[token]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_RATING, isPositiveRating } from "@/lib/feedback";

export interface FeedbackFormProps {
  token: string;
  businessName: string;
  googleReviewLink: string | null;
  customerName: string | null;
  /** Non-null when the customer already rated (a re-visit) — show the recap. */
  initialRating: number | null;
}

export function FeedbackForm({
  token,
  businessName,
  googleReviewLink,
  customerName,
  initialRating,
}: FeedbackFormProps) {
  const wasSubmitted = initialRating != null;
  const [rating, setRating] = useState<number | null>(initialRating);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [commentSent, setCommentSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(n: number) {
    if (rating != null || pending) return;
    setRating(n); // optimistic; the server keeps the first rating either way
    setPending(true);
    const res = await rateFeedback(token, n);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      setRating(null);
    }
  }

  async function sendComment() {
    setPending(true);
    const res = await commentFeedback(token, comment);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCommentSent(true);
  }

  // --- Not yet rated: the star picker ---------------------------------------
  if (rating == null) {
    return (
      <div className="space-y-6 text-center">
        <p className="text-lg font-medium">
          {customerName ? `Hi ${customerName}! ` : ""}How was your visit to{" "}
          {businessName}?
        </p>
        <div className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
          {Array.from({ length: MAX_RATING }, (_, i) => i + 1).map((n) => {
            const active = n <= (hover || 0);
            return (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                disabled={pending}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onClick={() => choose(n)}
                className="rounded-md p-1 transition-transform hover:scale-110 disabled:opacity-50"
              >
                <Star
                  className={
                    active
                      ? "size-9 fill-amber-400 text-amber-400"
                      : "size-9 text-muted-foreground"
                  }
                />
              </button>
            );
          })}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const positive = isPositiveRating(rating);

  // --- Positive: lead with the Google review CTA ----------------------------
  if (positive) {
    return (
      <div className="space-y-5 text-center">
        <p className="text-lg font-medium">
          So glad you had a great visit, thank you! 🎉
        </p>
        {googleReviewLink ? (
          <>
            <p className="text-sm text-muted-foreground">
              Would you mind sharing it in a quick Google review? It really helps{" "}
              {businessName}.
            </p>
            <Button asChild size="lg" className="w-full">
              <a href={googleReviewLink} target="_blank" rel="noopener noreferrer">
                Leave a Google review
              </a>
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Thanks for the kind rating — we appreciate you.
          </p>
        )}
      </div>
    );
  }

  // --- Low rating, already submitted on a prior visit: recap only -----------
  if (wasSubmitted) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-lg font-medium">Thanks for your feedback.</p>
        <p className="text-sm text-muted-foreground">
          We&apos;ve shared it with {businessName}.
        </p>
      </div>
    );
  }

  // --- Low rating, fresh: private comment to the owner ----------------------
  if (commentSent) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-lg font-medium">Thank you — we hear you.</p>
        <p className="text-sm text-muted-foreground">
          Your feedback goes straight to {businessName} so they can make it right.
        </p>
        {googleReviewLink ? (
          <a
            href={googleReviewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Prefer to leave a public review instead?
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <p className="text-lg font-medium">Sorry we missed the mark.</p>
      <p className="text-sm text-muted-foreground">
        What could {businessName} have done better? This goes privately to the
        owner.
      </p>
      <Textarea
        rows={4}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Tell us what happened…"
        className="text-left"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending || !comment.trim()}
        onClick={sendComment}
      >
        {pending ? "Sending…" : "Send feedback"}
      </Button>
      {googleReviewLink ? (
        <a
          href={googleReviewLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-muted-foreground underline underline-offset-4"
        >
          Prefer to leave a public review instead?
        </a>
      ) : null}
    </div>
  );
}
