import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: "$29",
    description: "For solo owners just getting started.",
    messages: "Up to 250 messages / month",
    features: ["Review requests", "One follow-up", "Missed-call recovery"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$79",
    description: "For busy shops with steady appointment flow.",
    messages: "Up to 1,000 messages / month",
    features: [
      "Everything in Starter",
      "Rebooking reminders",
      "Win-back campaigns",
    ],
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: "$149",
    description: "For multi-chair shops and high volume.",
    messages: "Up to 3,000 messages / month",
    features: ["Everything in Pro", "Priority support", "Higher send limits"],
  },
];

const currentPlanId = "pro";

export default function BillingPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Plans are based on the number of messages you send each month.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            You are on the Pro plan. 642 of 1,000 messages used this month.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-between">
          <Badge variant="secondary">Renews June 25, 2026</Badge>
          <Button variant="outline">Manage subscription</Button>
        </CardFooter>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.popular ? <Badge>Most popular</Badge> : null}
                  {isCurrent ? (
                    <Badge variant="secondary">Current plan</Badge>
                  ) : null}
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-semibold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
                <p className="text-sm text-muted-foreground">{plan.messages}</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="size-4 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent}
                >
                  {isCurrent ? "Current plan" : `Choose ${plan.name}`}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </>
  );
}
