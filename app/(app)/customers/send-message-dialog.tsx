"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { Customer, MessageChannel } from "@prisma/client";

import {
  sendMessageAction,
  type SendMessageFormState,
} from "@/app/(app)/messages/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_ORDER, messageTypeLabels } from "@/lib/default-templates";
import { renderTemplate } from "@/lib/render-template";

const initialState: SendMessageFormState = {};

export interface SendMessageBusiness {
  id: string;
  name: string;
  googleReviewLink: string | null;
}

export interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  business: SendMessageBusiness;
  templates: { type: string; body: string }[];
}

const DEFAULT_TYPE = "review_request";

export function SendMessageDialog({
  open,
  onOpenChange,
  customer,
  business,
  templates,
}: SendMessageDialogProps) {
  const templatesByType = useMemo(
    () => new Map(templates.map((t) => [t.type, t.body])),
    [templates],
  );

  const renderFor = useMemo(
    () => (type: string) => {
      const tplBody = templatesByType.get(type) ?? "";
      return renderTemplate(tplBody, {
        businessName: business.name,
        customerName: customer.name,
        reviewLink: business.googleReviewLink,
      });
    },
    [templatesByType, business.name, business.googleReviewLink, customer.name],
  );

  const defaultChannel = (c: Customer): MessageChannel =>
    c.phone ? "sms" : "email";

  const [type, setType] = useState<string>(DEFAULT_TYPE);
  const [channel, setChannel] = useState<MessageChannel>(() =>
    defaultChannel(customer),
  );
  const [body, setBody] = useState<string>(() => renderFor(DEFAULT_TYPE));

  // Reset the form whenever the dialog transitions to open, or the target
  // customer changes while open. Using the "store prior value" pattern (React
  // docs) instead of useEffect avoids cascading renders.
  const [openSnapshot, setOpenSnapshot] = useState(open);
  const [customerSnapshot, setCustomerSnapshot] = useState(customer.id);
  if (open !== openSnapshot || customer.id !== customerSnapshot) {
    setOpenSnapshot(open);
    setCustomerSnapshot(customer.id);
    if (open) {
      setType(DEFAULT_TYPE);
      setChannel(defaultChannel(customer));
      setBody(renderFor(DEFAULT_TYPE));
    }
  }

  const [state, formAction, pending] = useActionState(
    sendMessageAction,
    initialState,
  );

  useEffect(() => {
    if (state.successAt) onOpenChange(false);
  }, [state.successAt, onOpenChange]);

  function handleTypeChange(nextType: string) {
    setType(nextType);
    setBody(renderFor(nextType));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send message to {customer.name}</DialogTitle>
          <DialogDescription>
            Pick a template, preview the rendered message, and edit before
            sending.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="customerId" value={customer.id} />
          <input type="hidden" name="channel" value={channel} />
          <input type="hidden" name="type" value={type} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="type-trigger">Message type</FieldLabel>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger id="type-trigger" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {messageTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Channel</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={channel === "sms" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChannel("sms")}
                  disabled={!customer.phone}
                >
                  SMS
                </Button>
                <Button
                  type="button"
                  variant={channel === "email" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChannel("email")}
                  disabled={!customer.email}
                >
                  Email
                </Button>
              </div>
              <FieldDescription>
                {channel === "sms"
                  ? `Sending to ${customer.phone ?? "no phone on file"}`
                  : `Sending to ${customer.email ?? "no email on file"}`}
              </FieldDescription>
            </Field>

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
                Edits here only affect this one message. Change the template in
                Settings to update the default.
                {body.includes("{{feedbackLink}}")
                  ? " {{feedbackLink}} is replaced with the customer's private rating link when you send."
                  : ""}
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
              {pending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
