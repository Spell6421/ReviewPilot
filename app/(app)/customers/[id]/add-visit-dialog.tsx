"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import {
  addAppointmentAction,
  type AppointmentFormState,
} from "@/app/(app)/customers/[id]/actions";
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

const initialState: AppointmentFormState = {};

export function AddVisitDialog({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    addAppointmentAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Close the dialog whenever the action signals success (store-prior-value
  // pattern, avoids setState-in-effect).
  const [lastSuccessAt, setLastSuccessAt] = useState<number | undefined>(
    undefined,
  );
  if (state.successAt && state.successAt !== lastSuccessAt) {
    setLastSuccessAt(state.successAt);
    setOpen(false);
  }

  // Reset the form when the dialog closes so the next open is clean.
  useEffect(() => {
    if (!open) formRef.current?.reset();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          Add visit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a visit</DialogTitle>
          <DialogDescription>
            Record a past appointment. The service is optional.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction}>
          <input type="hidden" name="customerId" value={customerId} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="date">Date</FieldLabel>
              <Input id="date" name="date" type="date" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="service">Service</FieldLabel>
              <Input
                id="service"
                name="service"
                placeholder="Haircut, cleaning, …"
              />
              <FieldDescription>
                Optional. What the visit was for.
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
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add visit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
