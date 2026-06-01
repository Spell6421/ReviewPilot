"use server";

import { revalidatePath } from "next/cache";
import { MessageTemplateType } from "@prisma/client";

import { requireCurrentBusiness } from "@/lib/current-business";
import { TEMPLATE_ORDER, messageTypeLabels } from "@/lib/default-templates";
import { prisma } from "@/lib/prisma";

export type SettingsFormState = {
  error?: string;
  /** Bumps on every successful save so the form can show a "Saved" indicator. */
  successAt?: number;
};

export async function updateBusinessProfileAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { business } = await requireCurrentBusiness();

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const googleReviewLink =
    String(formData.get("googleReviewLink") ?? "").trim() || null;

  if (!name) {
    return { error: "Business name is required." };
  }

  await prisma.business.update({
    where: { id: business.id },
    data: { name, phone, googleReviewLink },
  });

  revalidatePath("/settings");
  return { successAt: Date.now() };
}

export async function updateTemplatesAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { business } = await requireCurrentBusiness();

  const updates: { type: MessageTemplateType; body: string }[] = [];
  for (const type of TEMPLATE_ORDER) {
    const body = String(formData.get(type) ?? "").trim();
    if (!body) {
      return { error: `${messageTypeLabels[type]} template can't be empty.` };
    }
    updates.push({ type, body });
  }

  // Upsert so a template row that's missing (e.g. business predates the
  // current default set) gets created instead of failing the save.
  await prisma.$transaction(
    updates.map(({ type, body }) =>
      prisma.messageTemplate.upsert({
        where: { businessId_type: { businessId: business.id, type } },
        create: { businessId: business.id, type, body },
        update: { body },
      }),
    ),
  );

  revalidatePath("/settings");
  return { successAt: Date.now() };
}
