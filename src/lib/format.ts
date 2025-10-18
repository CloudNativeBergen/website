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

export function formatCompactNumber(num: number): string {
  return num.toLocaleString('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  })
}
