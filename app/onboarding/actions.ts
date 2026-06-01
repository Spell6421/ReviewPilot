"use server";

import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/current-business";
import { DEFAULT_TEMPLATES } from "@/lib/default-templates";
import { prisma } from "@/lib/prisma";

export type OnboardingFormState = {
  error?: string;
};

export async function createBusinessAction(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const user = await requireCurrentUser();

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const googleReviewLink =
    String(formData.get("googleReviewLink") ?? "").trim() || null;

  if (!name) {
    return { error: "Business name is required." };
  }

  // If the user already has a business (e.g. they navigated back here),
  // don't create a second one — just bounce to the dashboard.
  const existing = await prisma.business.findFirst({
    where: { ownerId: user.id },
  });
  if (existing) {
    redirect("/dashboard");
  }

  await prisma.business.create({
    data: {
      ownerId: user.id,
      name,
      phone,
      googleReviewLink,
      messageTemplates: {
        create: DEFAULT_TEMPLATES,
      },
    },
  });

  redirect("/dashboard");
}
