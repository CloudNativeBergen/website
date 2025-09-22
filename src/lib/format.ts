export function formatNumber(
  num: number,
  options?: Intl.NumberFormatOptions,
): string {
  return num.toLocaleString('nb-NO', options)
}

export function formatCurrency(
  amount: number,
  currency: string = 'NOK',
): string {
  return `${formatNumber(amount)} ${currency}`
}

export function formatCompactNumber(num: number): string {
  return num.toLocaleString('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  })
}
