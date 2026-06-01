"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";

import {
  importCustomersAction,
  type ImportCustomersFormState,
} from "@/app/(app)/customers/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseCustomersCsv, type ParseResult } from "@/lib/csv-import";

const initialState: ImportCustomersFormState = {};

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function ImportCustomersDialog() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [state, formAction, pending] = useActionState(
    importCustomersAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Close the dialog on a successful import (snapshot pattern).
  const [lastSuccessAt, setLastSuccessAt] = useState<number | undefined>(
    undefined,
  );
  if (state.successAt && state.successAt !== lastSuccessAt) {
    setLastSuccessAt(state.successAt);
    setOpen(false);
  }

  // Clear the parsed preview when the dialog closes (snapshot pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setPreview(null);
  }

  // The native file input has DOM state we can't reach from React — reset it
  // imperatively in an effect when the dialog closes.
  useEffect(() => {
    if (!open) formRef.current?.reset();
  }, [open]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }
    const text = await file.text();
    setPreview(parseCustomersCsv(text));
  }

  const canImport =
    preview !== null && !preview.fatal && preview.validCount > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload data-icon="inline-start" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import customers from CSV</DialogTitle>
          <DialogDescription>
            Expected columns: <code>name</code>, <code>phone</code>,{" "}
            <code>email</code>, <code>last_appointment_at</code>. Name is
            required, plus a phone number or email.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="file">CSV file</FieldLabel>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                required
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
              />
              <FieldDescription>
                Rows missing a name, or both phone and email, will be skipped.
              </FieldDescription>
            </Field>

            {preview?.fatal ? (
              <p role="alert" className="text-sm text-destructive">
                {preview.fatal}
              </p>
            ) : null}

            {preview && !preview.fatal ? (
              <PreviewTable preview={preview} />
            ) : null}

            {state.error ? (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : null}
          </FieldGroup>
          <DialogFooter className="pt-6">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !canImport}>
              {pending
                ? "Importing…"
                : canImport
                  ? `Import ${preview.validCount} customer${preview.validCount === 1 ? "" : "s"}`
                  : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PreviewTable({ preview }: { preview: ParseResult }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {preview.validCount} valid · {preview.invalidCount} will be skipped
      </p>
      <div className="max-h-64 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Row</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Last appointment</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((row) => {
              const ok = row.errors.length === 0;
              return (
                <TableRow key={row.rowNumber}>
                  <TableCell className="text-muted-foreground">
                    {row.rowNumber}
                  </TableCell>
                  <TableCell>
                    {row.name || (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.lastAppointmentAt)}
                  </TableCell>
                  <TableCell>
                    {ok ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="size-3.5" /> OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="size-3.5" />
                        {row.errors.join(", ")}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
