import { notFound } from "next/navigation";

import { FeedbackForm } from "@/app/feedback/[token]/feedback-form";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "How was your visit?",
};

// Public, unauthenticated rating page. The token in the URL is the only
// credential — it resolves to one pending Feedback row. No (app) sidebar here.
export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const feedback = await prisma.feedback.findUnique({
    where: { token },
    include: {
      business: { select: { name: true, googleReviewLink: true } },
      customer: { select: { name: true } },
    },
  });

  if (!feedback) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-8">
          <FeedbackForm
            token={token}
            businessName={feedback.business.name}
            googleReviewLink={feedback.business.googleReviewLink}
            customerName={feedback.customer?.name ?? null}
            initialRating={feedback.rating}
          />
        </CardContent>
      </Card>
    </main>
  );
}
