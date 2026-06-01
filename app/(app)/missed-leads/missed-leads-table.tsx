"use client";

import { useState } from "react";
import type { MissedLead, MissedLeadStatus } from "@prisma/client";
import { Check, MoreHorizontal, Send, Trash2, X } from "lucide-react";

import {
  deleteMissedLeadAction,
  updateMissedLeadStatusAction,
} from "@/app/(app)/missed-leads/actions";
import { SendRecoveryDialog } from "@/app/(app)/missed-leads/send-recovery-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  missedLeadStatusLabels,
  missedLeadStatusVariant,
} from "@/lib/default-templates";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export interface MissedLeadsTableProps {
  leads: MissedLead[];
  recoveryBody: string;
}

export function MissedLeadsTable({ leads, recoveryBody }: MissedLeadsTableProps) {
  if (leads.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No missed leads yet</EmptyTitle>
        <EmptyDescription>
          Log a missed call to start tracking recovery attempts.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Logged</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={lead.id}>
            <TableCell className="font-medium">{lead.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {lead.phone ?? "—"}
            </TableCell>
            <TableCell className="max-w-xs truncate text-muted-foreground">
              {lead.notes ?? "—"}
            </TableCell>
            <TableCell>
              <Badge variant={missedLeadStatusVariant(lead.status)}>
                {missedLeadStatusLabels[lead.status]}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(lead.createdAt)}
            </TableCell>
            <TableCell className="text-right">
              <MissedLeadRowActions lead={lead} recoveryBody={recoveryBody} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MissedLeadRowActions({
  lead,
  recoveryBody,
}: {
  lead: MissedLead;
  recoveryBody: string;
}) {
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Which status transitions to surface depends on where the lead is now.
  // Booked / Lost are terminal-ish; we still let the owner roll them back to
  // "new" in case they mis-clicked.
  const nextStatuses: MissedLeadStatus[] = (() => {
    switch (lead.status) {
      case "new":
        return ["contacted", "booked", "lost"];
      case "contacted":
        return ["booked", "lost", "new"];
      case "booked":
        return ["contacted", "lost", "new"];
      case "lost":
        return ["new", "contacted", "booked"];
    }
  })();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${lead.name}`}
            className="text-muted-foreground"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setSendOpen(true);
            }}
            disabled={!lead.phone}
          >
            <Send className="size-4" />
            Send recovery text
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Mark as</DropdownMenuLabel>
          {nextStatuses.map((status) => (
            <DropdownMenuItem key={status} asChild>
              <form
                action={updateMissedLeadStatusAction}
                className="w-full"
              >
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="status" value={status} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-2"
                >
                  {status === "booked" ? (
                    <Check className="size-4" />
                  ) : status === "lost" ? (
                    <X className="size-4" />
                  ) : null}
                  {missedLeadStatusLabels[status]}
                </button>
              </form>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SendRecoveryDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        lead={lead}
        defaultBody={recoveryBody}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {lead.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the missed-lead record. Any recovery messages
              already sent stay in your message history. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={deleteMissedLeadAction}>
              <input type="hidden" name="id" value={lead.id} />
              <AlertDialogAction type="submit">Delete</AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
