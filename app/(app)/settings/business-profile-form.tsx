"use client";

import { useActionState } from "react";
import type { Business } from "@prisma/client";

import {
  updateBusinessProfileAction,
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: SettingsFormState = {};

export interface BusinessProfileFormProps {
  business: Business;
}

export function BusinessProfileForm({ business }: BusinessProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateBusinessProfileAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
        <CardDescription>
          This information appears in your customer-facing messages.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Business name</FieldLabel>
              <Input
                id="name"
                name="name"
                defaultValue={business.name}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Business phone</FieldLabel>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={business.phone ?? ""}
                placeholder="(555) 000-0000"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="googleReviewLink">
                Google review link
              </FieldLabel>
              <Input
                id="googleReviewLink"
                name="googleReviewLink"
                type="url"
                defaultValue={business.googleReviewLink ?? ""}
                placeholder="https://g.page/r/..."
              />
              <FieldDescription>
                Included in every review request you send.
              </FieldDescription>
            </Field>
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
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
