"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import {
  createMissedLeadAction,
  type MissedLeadFormState,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initialState: MissedLeadFormState = {};

export function AddMissedLeadDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createMissedLeadAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Close on success using the "store prior value" pattern (React docs).
  const [lastSuccessAt, setLastSuccessAt] = useState<number | undefined>(
    undefined,
  );
  if (state.successAt && state.successAt !== lastSuccessAt) {
    setLastSuccessAt(state.successAt);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) formRef.current?.reset();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          Log missed call
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a missed call</DialogTitle>
          <DialogDescription>
            Record the caller so you can text them back and track the recovery.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                name="name"
                placeholder="Unknown caller, or what you remember"
                required
              />
              <FieldDescription>
                Use the caller&apos;s name if you have it, otherwise something
                short like &ldquo;Tuesday afternoon caller&rdquo;.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="(555) 014-2231"
              />
              <FieldDescription>
                Required to send a recovery text.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="What did they want? Any context from the call?"
              />
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
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
