"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";

import {
  createBusinessAction,
  type OnboardingFormState,
} from "@/app/onboarding/actions";
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

const initialState: OnboardingFormState = {};

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState(
    createBusinessAction,
    initialState,
  );

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 px-6 py-12">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Star className="size-4" />
        </div>
        ReviewPilot
      </Link>

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Set up your business</CardTitle>
          <CardDescription>
            Tell us about your business so we can personalize your review
            requests and follow-ups.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Business name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  placeholder="Acme Barbers"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Business phone</FieldLabel>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="(555) 000-0000"
                />
                <FieldDescription>
                  Used as the sender identity on customer-facing messages.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="googleReviewLink">
                  Google review link
                </FieldLabel>
                <Input
                  id="googleReviewLink"
                  name="googleReviewLink"
                  type="url"
                  placeholder="https://g.page/r/..."
                />
                <FieldDescription>
                  We&apos;ll include this link in every review request.
                </FieldDescription>
              </Field>
              {state.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {state.error}
                </p>
              ) : null}
            </FieldGroup>
            <CardFooter className="justify-end gap-2 px-0 pt-6">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Continue"}
                {!pending ? <ArrowRight data-icon="inline-end" /> : null}
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
