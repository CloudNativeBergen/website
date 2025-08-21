/**
 * Format numbers consistently for SSR/client rendering compatibility
 * Uses nb-NO locale for Norwegian formatting (space as thousand separator)
 */
export function formatNumber(
  num: number,
  options?: Intl.NumberFormatOptions,
): string {
  return num.toLocaleString('nb-NO', options)
}

/**
 * Format currency amounts consistently
 */
export function formatCurrency(
  amount: number,
  currency: string = 'NOK',
): string {
  return `${formatNumber(amount)} ${currency}`
}

/**
 * Format large numbers with compact notation (1K, 1M, etc.)
 */
export function formatCompactNumber(num: number): string {
  return num.toLocaleString('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  })
}
