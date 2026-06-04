export interface TemplateVars {
  businessName?: string;
  customerName?: string;
  reviewLink?: string | null;
  feedbackLink?: string | null;
}

const PLACEHOLDER =
  /\{\{\s*(businessName|customerName|reviewLink|feedbackLink)\s*\}\}/g;

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(PLACEHOLDER, (match, key: keyof TemplateVars) => {
    // A variable the caller didn't supply is left as a literal placeholder so a
    // later stage can fill it. This is how {{feedbackLink}} survives rendering
    // (here) and gets minted + substituted at send time (lib/send-message.ts),
    // keeping the pure find*/preview path free of side effects.
    if (!(key in vars)) return match;
    return vars[key] ?? "";
  });
}
