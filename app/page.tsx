import Link from "next/link";
import { ArrowRight, PhoneMissed, RefreshCw, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    icon: Star,
    title: "More Google reviews",
    description:
      "Automatically ask happy customers for a review after every appointment, then send one polite follow-up.",
  },
  {
    icon: PhoneMissed,
    title: "Recover missed calls",
    description:
      "Text missed callers back right away so a lost call doesn't turn into a lost customer.",
  },
  {
    icon: RefreshCw,
    title: "Bring customers back",
    description:
      "Send rebooking reminders and win-back nudges to customers who have gone quiet.",
  },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Star className="size-4" />
      </div>
      ReviewPilot
    </Link>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Brand />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/onboarding">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-24 text-center">
          <Badge variant="secondary">For local service businesses</Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Get more Google reviews and recover lost leads automatically.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground text-balance">
            ReviewPilot turns completed appointments, missed calls, and quiet
            customers into reviews, follow-ups, and rebookings — without the
            manual admin work.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/onboarding">
                Get started
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-5" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
        © 2026 ReviewPilot. Built for local service businesses.
      </footer>
    </div>
  );
}
