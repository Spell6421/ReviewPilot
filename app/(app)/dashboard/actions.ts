"use server";

import { buildAutomationPreview, type AutomationPreview } from "@/lib/automations/preview";
import { requireCurrentBusiness } from "@/lib/current-business";

export type PreviewState = {
  preview?: AutomationPreview;
  error?: string;
  ranAt?: number;
};

/**
 * Read-only "test my setup" action for the dashboard. Builds the connection +
 * dry-run report for the current business. Sends nothing — see
 * lib/automations/preview.ts.
 */
// useActionState requires the (prevState, formData) signature; this read-only
// action needs neither input.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function previewAutomationsAction(_prev: PreviewState, _formData: FormData): Promise<PreviewState> {
  const { business } = await requireCurrentBusiness();
  try {
    const preview = await buildAutomationPreview(business);
    return { preview, ranAt: Date.now() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
