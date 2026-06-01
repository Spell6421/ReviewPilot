import Papa from "papaparse";

import { normalizePhone } from "@/lib/phone";

export interface ParsedCustomerRow {
  /** 1-indexed source row number (row 2 = first data row after header). */
  rowNumber: number;
  name: string;
  phone: string | null;
  email: string | null;
  lastAppointmentAt: Date | null;
  errors: string[];
}

export interface ParseResult {
  rows: ParsedCustomerRow[];
  validCount: number;
  invalidCount: number;
  /** File-level error (missing required column, empty file). Blocks import. */
  fatal?: string;
}

// Common header spellings exported by QuickBooks, Square, etc. all collapse to
// the canonical four columns. Lowered + spaces-to-underscores before lookup.
const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  full_name: "name",
  customer: "name",
  customer_name: "name",
  client: "name",
  client_name: "name",
  phone: "phone",
  phone_number: "phone",
  mobile: "phone",
  mobile_number: "phone",
  cell: "phone",
  email: "email",
  email_address: "email",
  last_appointment_at: "last_appointment_at",
  last_appointment: "last_appointment_at",
  appointment_date: "last_appointment_at",
  last_visit: "last_appointment_at",
  last_seen: "last_appointment_at",
};

function normalizeHeader(raw: string): string {
  const lowered = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[lowered] ?? lowered;
}

export function parseCustomersCsv(text: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });

  const headers = result.meta.fields ?? [];

  if (!headers.includes("name")) {
    return {
      rows: [],
      validCount: 0,
      invalidCount: 0,
      fatal:
        'Missing required column "name". Expected columns: name, phone, email, last_appointment_at.',
    };
  }

  if (!headers.includes("phone") && !headers.includes("email")) {
    return {
      rows: [],
      validCount: 0,
      invalidCount: 0,
      fatal: 'Must include at least one of "phone" or "email" as a column.',
    };
  }

  if (result.data.length === 0) {
    return {
      rows: [],
      validCount: 0,
      invalidCount: 0,
      fatal: "No rows found in the file.",
    };
  }

  let validCount = 0;
  let invalidCount = 0;

  const rows: ParsedCustomerRow[] = result.data.map((raw, i) => {
    const name = (raw.name ?? "").trim();
    const phoneRaw = (raw.phone ?? "").trim();
    const phone = normalizePhone(phoneRaw); // null if missing or unparseable
    const email = (raw.email ?? "").trim() || null;
    const lastApptRaw = (raw.last_appointment_at ?? "").trim();

    const errors: string[] = [];
    if (!name) errors.push("Missing name");
    // A phone that was provided but couldn't be normalized is surfaced so the
    // owner sees it in the preview rather than silently losing the number.
    if (phoneRaw && !phone) errors.push("Invalid phone number");
    if (!phone && !email) errors.push("Missing phone and email");

    let lastAppointmentAt: Date | null = null;
    if (lastApptRaw) {
      const parsed = new Date(lastApptRaw);
      if (Number.isNaN(parsed.getTime())) {
        errors.push("Invalid date");
      } else {
        lastAppointmentAt = parsed;
      }
    }

    if (errors.length === 0) validCount++;
    else invalidCount++;

    return {
      rowNumber: i + 2,
      name,
      phone,
      email,
      lastAppointmentAt,
      errors,
    };
  });

  return { rows, validCount, invalidCount };
}
