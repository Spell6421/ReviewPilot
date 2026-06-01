"use client";

import { useMemo, useState } from "react";
import type { Customer } from "@prisma/client";
import { MoreHorizontal, Search, Send, Trash2 } from "lucide-react";

import { deleteCustomerAction } from "@/app/(app)/customers/actions";
import {
  SendMessageDialog,
  type SendMessageBusiness,
} from "@/app/(app)/customers/send-message-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export interface CustomersTableProps {
  customers: Customer[];
  business: SendMessageBusiness;
  templates: { type: string; body: string }[];
}

export function CustomersTable({
  customers,
  business,
  templates,
}: CustomersTableProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = `${c.name} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [customers, query]);

  if (customers.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No customers yet</EmptyTitle>
        <EmptyDescription>
          Add your first customer to start sending review requests.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search customers"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Last appointment</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-sm text-muted-foreground"
              >
                No customers match &ldquo;{query}&rdquo;.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium">{customer.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {customer.phone ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {customer.email ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(customer.lastAppointmentAt)}
                </TableCell>
                <TableCell className="text-right">
                  <CustomerRowActions
                    customer={customer}
                    business={business}
                    templates={templates}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function CustomerRowActions({
  customer,
  business,
  templates,
}: {
  customer: Customer;
  business: SendMessageBusiness;
  templates: { type: string; body: string }[];
}) {
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const canMessage = Boolean(customer.phone || customer.email);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${customer.name}`}
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
            disabled={!canMessage}
          >
            <Send className="size-4" />
            Send message
          </DropdownMenuItem>
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

      <SendMessageDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        customer={customer}
        business={business}
        templates={templates}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the customer and any messages linked to them will
              lose the link. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={deleteCustomerAction}>
              <input type="hidden" name="id" value={customer.id} />
              <AlertDialogAction type="submit">Delete</AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
