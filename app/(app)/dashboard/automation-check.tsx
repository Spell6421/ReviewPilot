"use client";

import { useActionState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";

import { previewAutomationsAction, type PreviewState } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const INITIAL: PreviewState = {};

export function AutomationCheck() {
  const [state, action, pending] = useActionState(previewAutomationsAction, INITIAL);
  const { preview, error } = state;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test my setup</CardTitle>
        <CardDescription>
          Check your connections and preview what your automations would send —
          without sending anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={action}>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Checking your account…
              </>
            ) : (
              "Run a test check"
            )}
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {preview && !pending && (
          <div className="flex flex-col gap-4 text-sm">
            <ul className="flex flex-col gap-2">
              {preview.checks.map((check) => (
                <li key={check.label} className="flex items-start gap-2">
                  {check.ok ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex flex-col">
                    <span className={check.ok ? "" : "text-muted-foreground"}>
                      {check.label}
                    </span>
                    {check.note && (
                      <span className="text-xs text-muted-foreground">{check.note}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <Separator />

            <div className="flex flex-col gap-2">
              <p className="font-medium">
                {preview.totalDue === 0
                  ? "Nothing is due right now — you're all caught up."
                  : "A run right now would send:"}
              </p>
              <ul className="flex flex-col gap-2">
                {preview.lines.map((line) => (
                  <li key={line.kind} className="flex items-baseline gap-2">
                    <span className="w-6 shrink-0 text-right font-semibold tabular-nums">
                      {line.count}
                    </span>
                    <span className="flex flex-col">
                      <span>{line.label}</span>
                      <span className="text-xs text-muted-foreground">{line.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-muted-foreground">
              Nothing was sent — this was just a preview.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
