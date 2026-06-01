"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

import { authAction, type AuthFormState } from "@/app/login/actions";
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
import { Input } from "@/components/ui/input";

const initialState: AuthFormState = {};

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, formAction, pending] = useActionState(authAction, initialState);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 px-6 py-12">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Star className="size-4" />
        </div>
        ReviewPilot
      </Link>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "signin" ? "Sign in" : "Create your account"}</CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Welcome back. Enter your details to continue."
              : "Start sending review requests and following up on missed calls."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <input type="hidden" name="mode" value={mode} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@business.com"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  required
                />
              </Field>
              {state.error ? (
                <p
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {state.error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending
                  ? "Working…"
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          {mode === "signin" ? (
            <p className="text-sm text-muted-foreground">
              New to ReviewPilot?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Create an account
              </button>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Sign in
              </button>
            </p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
