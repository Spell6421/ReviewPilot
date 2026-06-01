"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import {
  createCustomerAction,
  type CustomerFormState,
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
import { Input } from "@/components/ui/input";

const initialState: CustomerFormState = {};

export function AddCustomerDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createCustomerAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Close the dialog whenever the action signals success. Uses the "store
  // prior value" pattern from React docs to avoid setState-in-effect.
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
          Add customer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a customer</DialogTitle>
          <DialogDescription>
            Phone or email is needed so you can message them later.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" placeholder="Jordan Lee" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="(555) 014-2231"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="jordan@example.com"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastAppointmentAt">
                Last appointment
              </FieldLabel>
              <Input
                id="lastAppointmentAt"
                name="lastAppointmentAt"
                type="date"
              />
              <FieldDescription>
                Optional. Used to schedule follow-ups later.
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
              {pending ? "Saving…" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
