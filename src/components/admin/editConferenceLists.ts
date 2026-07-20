/**
 * Pure, React-free list helpers for the SE-1b array/object fieldsets in
 * {@link ./EditConferenceCard}. Extracted so the payload-shaping and per-row
 * validation can be unit-tested under `vitest` (node env) without rendering —
 * the component wires these into its form state, the tests assert them directly.
 */

import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'

/** An `object-list` row: column-name → value, plus a stable Sanity `_key`. */
export type ListRow = Record<string, string>

/** A `_key` minted client-side for a brand-new row; the server re-keys these. */
export const TEMP_KEY_PREFIX = 'tmp-'

/** The subset of a field definition the list helpers need. */
export interface ListFieldSpec {
  name: string
  itemType?: 'text' | 'url' | 'hostname'
  itemLabel?: string
  allowEmptyList?: boolean
  columns?: { name: string; label: string; required?: boolean }[]
}

function isValidUrl(value: string): boolean {
  try {
    return Boolean(new URL(value))
  } catch {
    return false
  }
}

/** Drop blank rows and trim; preserves order. Used for `string-list` payloads. */
export function buildStringListPayload(rows: string[]): string[] {
  return rows.map((s) => s.trim()).filter((s) => s !== '')
}

/**
 * Shape an `object-list` payload: drop fully-empty rows, trim cells, omit empty
 * optional columns, and forward a real `_key` (temp keys are stripped so the
 * server mints a fresh one).
 */
export function buildObjectListPayload(
  columns: NonNullable<ListFieldSpec['columns']>,
  rows: ListRow[],
): Record<string, string>[] {
  return rows
    .filter((row) => columns.some((c) => (row[c.name] ?? '').trim() !== ''))
    .map((row) => {
      const out: Record<string, string> = {}
      for (const c of columns) {
        const v = (row[c.name] ?? '').trim()
        if (v !== '' || c.required) out[c.name] = v
      }
      if (row._key && !row._key.startsWith(TEMP_KEY_PREFIX)) {
        out._key = row._key
      }
      return out
    })
}

/**
 * Validate a `string-list`. Errors are keyed `<field>` (list-level) and
 * `<field>.<rowIndex>` (per row). Blank rows are ignored (dropped on save),
 * except that an `allowEmptyList: false` list with no non-blank rows errors.
 */
export function validateStringList(
  f: ListFieldSpec,
  rows: string[],
): Record<string, string> {
  const errs: Record<string, string> = {}
  const nonEmpty = rows.map((r) => r.trim()).filter((r) => r !== '')

  if (f.allowEmptyList === false && nonEmpty.length === 0) {
    errs[f.name] = `At least one ${f.itemLabel ?? 'entry'} is required`
  }

  const seen = new Set<string>()
  rows.forEach((rawRow, i) => {
    const s = rawRow.trim()
    if (s === '') return
    if (f.itemType === 'url' && !isValidUrl(s)) {
      errs[`${f.name}.${i}`] = 'Enter a valid URL'
    } else if (
      f.itemType === 'hostname' &&
      !isValidDomainEntry(normalizeDomain(s))
    ) {
      errs[`${f.name}.${i}`] =
        'Enter a bare hostname (no https://, no path), e.g. example.com'
    }
    const norm = f.itemType === 'hostname' ? normalizeDomain(s) : s
    if (seen.has(norm)) errs[`${f.name}.${i}`] = 'Duplicate entry'
    seen.add(norm)
  })
  return errs
}

/** Validate an `object-list`: required columns per non-empty row. */
export function validateObjectList(
  f: ListFieldSpec,
  rows: ListRow[],
): Record<string, string> {
  const errs: Record<string, string> = {}
  const cols = f.columns ?? []
  rows.forEach((row, i) => {
    const rowHasContent = cols.some((c) => (row[c.name] ?? '').trim() !== '')
    if (!rowHasContent) return // fully-empty rows are dropped on save
    for (const c of cols) {
      if (c.required && (row[c.name] ?? '').trim() === '') {
        errs[`${f.name}.${i}.${c.name}`] = `${c.label} is required`
      }
    }
  })
  return errs
}

/** Move the item at `from` to `to`, returning a new array (no-op if OOB). */
export function moveRow<T>(rows: T[], from: number, to: number): T[] {
  if (to < 0 || to >= rows.length || from < 0 || from >= rows.length)
    return rows
  const next = [...rows]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}
