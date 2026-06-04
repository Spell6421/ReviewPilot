"use client";

import { useActionState } from "react";
import type { MessageTemplateType } from "@prisma/client";

import {
  updateTemplatesAction,
  type SettingsFormState,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { messageTypeLabels } from "@/lib/default-templates";

const initialState: SettingsFormState = {};

export interface TemplatesFormProps {
  templates: { type: MessageTemplateType; body: string }[];
}

export function TemplatesForm({ templates }: TemplatesFormProps) {
  const [state, formAction, pending] = useActionState(
    updateTemplatesAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Message templates</CardTitle>
        <CardDescription>
          Use {"{{businessName}}"}, {"{{customerName}}"}, and {"{{reviewLink}}"}{" "}
          as placeholders. In review messages, {"{{feedbackLink}}"} is replaced at
          send time with the customer&apos;s private rating link (they rate first,
          then happy customers are sent to your Google review).
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent>
          <FieldGroup>
            {templates.map((template) => (
              <Field key={template.type}>
                <FieldLabel htmlFor={template.type}>
                  {messageTypeLabels[template.type]}
                </FieldLabel>
                <Textarea
                  id={template.type}
                  name={template.type}
                  rows={3}
                  defaultValue={template.body}
                  required
                />
              </Field>
            ))}
            {state.error ? (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end gap-3">
          {state.successAt && !state.error ? (
            <span className="text-sm text-muted-foreground">Saved</span>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save templates"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
