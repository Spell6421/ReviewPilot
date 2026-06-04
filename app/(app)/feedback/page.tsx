import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireCurrentBusiness } from "@/lib/current-business";
import { isPositiveRating } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
}

export default async function FeedbackPage() {
  const { business } = await requireCurrentBusiness();

  // Only submitted feedback (rating set) belongs in the inbox; pending requests
  // are just outstanding links. Newest first.
  const feedback = await prisma.feedback.findMany({
    where: { businessId: business.id, rating: { not: null } },
    include: { customer: { select: { name: true } } },
    orderBy: { submittedAt: "desc" },
    take: 100,
  });

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Ratings customers left after their visit. Happy customers are sent to
          your Google review; lower ratings land here privately so you can make
          it right.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer feedback</CardTitle>
          <CardDescription>
            Private feedback from the post-visit rating page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feedback.length === 0 ? (
            <Empty>
              <EmptyTitle>No feedback yet</EmptyTitle>
              <EmptyDescription>
                Once you send review requests, customer ratings will show up here.
              </EmptyDescription>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedback.map((item) => {
                  const rating = item.rating ?? 0;
                  const happy = isPositiveRating(rating);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.customer?.name ?? "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={happy ? "secondary" : "destructive"}>
                          <span className="tracking-tight text-amber-500">
                            {stars(rating)}
                          </span>
                          <span className="ml-1">{rating}/5</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-sm text-muted-foreground">
                        {item.comment ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(item.submittedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
