"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { deleteAppointmentAction } from "@/app/(app)/customers/[id]/actions";
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
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface VisitRow {
  id: string;
  date: Date;
  service: string | null;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function VisitHistory({
  customerId,
  appointments,
}: {
  customerId: string;
  appointments: VisitRow[];
}) {
  if (appointments.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No visits recorded yet</EmptyTitle>
        <EmptyDescription>
          Add a visit to start building this customer&apos;s history.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Service</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {appointments.map((appointment) => (
          <TableRow key={appointment.id}>
            <TableCell className="font-medium">
              {formatDate(appointment.date)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {appointment.service ?? "—"}
            </TableCell>
            <TableCell className="text-right">
              <DeleteVisitControl
                appointmentId={appointment.id}
                customerId={customerId}
                label={formatDate(appointment.date)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DeleteVisitControl({
  appointmentId,
  customerId,
  label,
}: {
  appointmentId: string;
  customerId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete visit on ${label}`}
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this visit?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {label} visit from the customer&apos;s history.
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={deleteAppointmentAction}>
              <input type="hidden" name="id" value={appointmentId} />
              <input type="hidden" name="customerId" value={customerId} />
              <AlertDialogAction type="submit">Delete</AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
