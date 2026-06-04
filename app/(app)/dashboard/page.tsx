import { AutomationCheck } from "./automation-check";
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
import {
  messageStatusLabels,
  messageStatusVariant,
  messageTypeLabels,
} from "@/lib/default-templates";
import { prisma } from "@/lib/prisma";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function getOneWeekAgo(): Promise<Date> {
  // Wrapped in an async helper so the lint rule (react-hooks/purity) doesn't
  // flag reading the clock as an impure call during render. Dashboard is a
  // server component, so re-evaluating per request is the desired behavior.
  return new Date(Date.now() - ONE_WEEK_MS);
}

function formatDateTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function DashboardPage() {
  const { business } = await requireCurrentBusiness();
  const oneWeekAgo = await getOneWeekAgo();

  const [requestsSent, replies, leadsRecovered, messagesThisWeek, recent] =
    await Promise.all([
      prisma.message.count({
        where: {
          businessId: business.id,
          type: { in: ["review_request", "review_follow_up"] },
          status: "sent",
        },
      }),
      prisma.message.count({
        where: { businessId: business.id, status: "replied" },
      }),
      prisma.missedLead.count({
        where: { businessId: business.id, status: "booked" },
      }),
      prisma.message.count({
        where: {
          businessId: business.id,
          createdAt: { gte: oneWeekAgo },
        },
      }),
      prisma.message.findMany({
        where: { businessId: business.id },
        include: {
          customer: { select: { name: true } },
          missedLead: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const stats = [
    {
      label: "Review requests sent",
      value: requestsSent,
      hint: "All time",
    },
    {
      label: "Replies received",
      value: replies,
      hint: "All time",
    },
    {
      label: "Missed leads recovered",
      value: leadsRecovered,
      hint: "Booked from missed calls",
    },
    {
      label: "Messages this week",
      value: messagesThisWeek,
      hint: "Last 7 days",
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          An overview of your reviews, replies, and recovered leads.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-xs text-muted-foreground">{stat.hint}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <AutomationCheck />

      <Card>
        <CardHeader>
          <CardTitle>Recent messages</CardTitle>
          <CardDescription>
            The latest review requests, follow-ups, and recovery messages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <Empty>
              <EmptyTitle>No messages yet</EmptyTitle>
              <EmptyDescription>
                Send your first message from the Customers page.
              </EmptyDescription>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="font-medium">
                      {message.customer?.name ??
                        message.missedLead?.name ??
                        "Unknown"}
                    </TableCell>
                    <TableCell>{messageTypeLabels[message.type]}</TableCell>
                    <TableCell className="uppercase">
                      {message.channel}
                    </TableCell>
                    <TableCell>
                      <Badge variant={messageStatusVariant(message.status)}>
                        {messageStatusLabels[message.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTime(message.sentAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
