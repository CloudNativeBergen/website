/**
 * Format a Norwegian organization number as "XXX XXX XXX".
 *
 * Handles raw 9-digit strings ("933338622"), already-spaced strings
 * ("933 338 622"), and VAT numbers with NO prefix / MVA suffix
 * ("NO933338622MVA" → "NO 933 338 622 MVA").
 *
 * Non-Norwegian or non-9-digit values are returned unchanged.
 */
export function formatOrgNumber(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return value

  const match = trimmed.match(/^(NO\s*)?(\d[\d\s]+\d)\s*(MVA)?$/i)
  if (!match) return value

  const prefix = match[1] ? 'NO ' : ''
  const digits = match[2].replace(/\s/g, '')
  const suffix = match[3] ? ' MVA' : ''

  if (digits.length !== 9) return value

  const formatted = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`
  return `${prefix}${formatted}${suffix}`
}

export function formatNumber(
  num: number,
  options?: Intl.NumberFormatOptions,
): string {
  return num.toLocaleString('nb-NO', options)
}

export function formatCurrency(
  amount: number,
  currency: string = 'NOK',
  options?: {
    locale?: string
    minimumFractionDigits?: number
    maximumFractionDigits?: number
    useIntlFormat?: boolean
  },
): string {
  const {
    locale = 'nb-NO',
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
    useIntlFormat = true,
  } = options || {}

  if (useIntlFormat) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount)
  }

  return `${formatNumber(amount)} ${currency}`
}
