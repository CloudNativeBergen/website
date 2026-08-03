/**
 * Characters that make a spreadsheet treat a cell as a formula. Exports carry
 * text people typed (sponsor names, billing comments), so cells starting with
 * one are prefixed with an apostrophe — the standard defence against CSV
 * injection when the file is opened in Excel or Sheets.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

/** Quotes, escapes and de-weaponises a single cell. */
export function csvCell(value: string | number | undefined | null): string {
  const raw = String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .trim()
  const safe = FORMULA_PREFIXES.some((prefix) => raw.startsWith(prefix))
    ? `'${raw}`
    : raw
  return /[",;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** One comma-separated line. */
export function csvRow(
  cells: Array<string | number | undefined | null>,
): string {
  return cells.map(csvCell).join(',')
}

/**
 * A complete CSV document, prefixed with a UTF-8 BOM — without it Excel
 * mis-reads Norwegian characters in sponsor names.
 */
export function csvDocument(
  headers: readonly string[],
  rows: Array<Array<string | number | undefined | null>>,
): string {
  return `﻿${[csvRow([...headers]), ...rows.map(csvRow)].join('\n')}\n`
}

/** Slugified filename stem, e.g. `sponsor-contacts-cloud-native-days-2026.csv`. */
export function csvFilename(prefix: string, context: string): string {
  const slug = context
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${prefix}${slug ? `-${slug}` : ''}.csv`
}
