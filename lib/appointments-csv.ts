import Papa from "papaparse";

import { normalizePhone } from "@/lib/phone";

export interface ParsedAppointmentRow {
  /** 1-indexed source row number (row 2 = first data row after header). */
  rowNumber: number;
  name: string;
  phone: string | null;
  date: Date | null;
  service: string | null;
  source: string | null;
  errors: string[];
}

export interface AppointmentParseResult {
  rows: ParsedAppointmentRow[];
  validCount: number;
  invalidCount: number;
  /** File-level error (missing required column, empty file). Blocks import. */
  fatal?: string;
}

// Common header spellings collapse to the canonical columns. This is a DEDICATED
// appointments CSV (one row per visit, D-08) — NOT an overload of the customer
// CSV. name + phone are needed to match-or-auto-create the customer (D-09); date
// is needed for the visit itself. Lowered + spaces-to-underscores before lookup.
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
  date: "date",
  appointment_date: "date",
  visit_date: "date",
  appointment: "date",
  service: "service",
  treatment: "service",
  reason: "service",
  source: "source",
};

function normalizeHeader(raw: string): string {
  const lowered = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[lowered] ?? lowered;
}

export function parseAppointmentsCsv(text: string): AppointmentParseResult {
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
        'Missing required column "name". Expected columns: name, phone, date, service.',
    };
  }

  if (!headers.includes("phone")) {
    return {
      rows: [],
      validCount: 0,
      invalidCount: 0,
      fatal:
        'Missing required column "phone". A phone number is needed to match or create the customer.',
    };
  }

  if (!headers.includes("date")) {
    return {
      rows: [],
      validCount: 0,
      invalidCount: 0,
      fatal:
        'Missing required column "date". Each row is one visit and needs a date.',
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

  const rows: ParsedAppointmentRow[] = result.data.map((raw, i) => {
    const name = (raw.name ?? "").trim();
    const phoneRaw = (raw.phone ?? "").trim();
    const phone = normalizePhone(phoneRaw); // null if missing or unparseable
    const dateRaw = (raw.date ?? "").trim();
    const service = (raw.service ?? "").trim() || null;
    const source = (raw.source ?? "").trim() || null;

    const errors: string[] = [];
    if (!name) errors.push("Missing name");
    // Phone is REQUIRED here (unlike the customer CSV's phone-OR-email): it's the
    // match/auto-create key (D-09). A provided-but-unparseable number is surfaced
    // so the owner sees it in the preview rather than silently losing the row.
    if (phoneRaw && !phone) errors.push("Invalid phone number");
    if (!phoneRaw) errors.push("Missing phone");

    let date: Date | null = null;
    if (dateRaw) {
      const parsed = new Date(dateRaw);
      if (Number.isNaN(parsed.getTime())) {
        errors.push("Invalid date");
      } else {
        date = parsed;
      }
    } else {
      errors.push("Missing date");
    }

    if (errors.length === 0) validCount++;
    else invalidCount++;

    return {
      rowNumber: i + 2,
      name,
      phone,
      date,
      service,
      source,
      errors,
    };
  });

  return { rows, validCount, invalidCount };
}
