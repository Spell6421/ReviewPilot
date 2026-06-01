export interface TemplateVars {
  businessName: string;
  customerName: string;
  reviewLink: string | null;
}

const PLACEHOLDER = /\{\{\s*(businessName|customerName|reviewLink)\s*\}\}/g;

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(PLACEHOLDER, (_, key: keyof TemplateVars) => {
    const value = vars[key];
    return value ?? "";
  });
}
