"use client";

import { useActionState, useEffect, useState } from "react";
import type { MissedLead } from "@prisma/client";

import {
  sendRecoveryMessageAction,
  type SendRecoveryFormState,
} from "@/app/(app)/missed-leads/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

const initialState: SendRecoveryFormState = {};

export interface SendRecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: MissedLead;
  defaultBody: string;
}

export function SendRecoveryDialog({
  open,
  onOpenChange,
  lead,
  defaultBody,
}: SendRecoveryDialogProps) {
  const [body, setBody] = useState(defaultBody);

  // Reset body whenever the dialog re-opens or the target lead changes,
  // using the "store prior value" pattern (React docs).
  const [snapshot, setSnapshot] = useState({ open, leadId: lead.id });
  if (snapshot.open !== open || snapshot.leadId !== lead.id) {
    setSnapshot({ open, leadId: lead.id });
    if (open) setBody(defaultBody);
  }

  const [state, formAction, pending] = useActionState(
    sendRecoveryMessageAction,
    initialState,
  );

  useEffect(() => {
    if (state.successAt) onOpenChange(false);
  }, [state.successAt, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Text {lead.name} back</DialogTitle>
          <DialogDescription>
            Send the recovery message. The lead will move to &ldquo;contacted&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="id" value={lead.id} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="body">Message</FieldLabel>
              <Textarea
                id="body"
                name="body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
              <FieldDescription>
                Sending to {lead.phone ?? "no phone on file"} via SMS. Edit the
                default in Settings → Message templates.
              </FieldDescription>
            </Field>
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
            <Button type="submit" disabled={pending || !lead.phone}>
              {pending ? "Sending…" : "Send recovery text"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
