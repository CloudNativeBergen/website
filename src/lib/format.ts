/**
 * Format numbers consistently for SSR/client rendering compatibility
 * Uses en-US locale to avoid hydration mismatches
 */
export function formatNumber(
  num: number,
  options?: Intl.NumberFormatOptions,
): string {
  return num.toLocaleString('en-US', options)
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
