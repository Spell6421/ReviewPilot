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

function formatDateTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function MessagesPage() {
  const { business } = await requireCurrentBusiness();

  const messages = await prisma.message.findMany({
    where: { businessId: business.id },
    include: {
      customer: { select: { name: true } },
      missedLead: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Every message attempt is recorded here, sent or not.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message history</CardTitle>
          <CardDescription>
            Review requests, follow-ups, missed-call recoveries, and win-backs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
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
                  <TableHead>Message</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="font-medium">
                      {message.customer?.name ??
                        message.missedLead?.name ??
                        "Unknown"}
                    </TableCell>
                    <TableCell>{messageTypeLabels[message.type]}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {message.body}
                    </TableCell>
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
