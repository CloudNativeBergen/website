import type { SupportedCurrency } from './types'
import { TIMEOUTS, EXCHANGE_RATE_CONFIG } from './config'

// Exchange rate cache interface
interface ExchangeRateCache {
  rates: Record<string, Record<string, number>>
  lastUpdated: string
  baseCurrency: string
}

// Cache key for localStorage
const CACHE_KEY = EXCHANGE_RATE_CONFIG.cacheKey
const CACHE_DURATION = EXCHANGE_RATE_CONFIG.cacheDuration

// Fallback exchange rates (used when API is unavailable)
const FALLBACK_RATES: Record<
  SupportedCurrency,
  Record<SupportedCurrency, number>
> = {
  NOK: {
    NOK: 1,
    USD: 0.092,
    EUR: 0.086,
    GBP: 0.074,
    SEK: 0.95,
    DKK: 0.64,
    OTHER: 1,
  },
  USD: {
    NOK: 10.87,
    USD: 1,
    EUR: 0.94,
    GBP: 0.81,
    SEK: 10.33,
    DKK: 6.96,
    OTHER: 1,
  },
  EUR: {
    NOK: 11.6,
    USD: 1.07,
    EUR: 1,
    GBP: 0.86,
    SEK: 11.0,
    DKK: 7.43,
    OTHER: 1,
  },
  GBP: {
    NOK: 13.5,
    USD: 1.24,
    EUR: 1.16,
    GBP: 1,
    SEK: 12.84,
    DKK: 8.66,
    OTHER: 1,
  },
  SEK: {
    NOK: 1.05,
    USD: 0.097,
    EUR: 0.091,
    GBP: 0.078,
    SEK: 1,
    DKK: 0.67,
    OTHER: 1,
  },
  DKK: {
    NOK: 1.56,
    USD: 0.14,
    EUR: 0.13,
    GBP: 0.12,
    SEK: 1.48,
    DKK: 1,
    OTHER: 1,
  },
  OTHER: { NOK: 1, USD: 1, EUR: 1, GBP: 1, SEK: 1, DKK: 1, OTHER: 1 },
}

// Supported currencies for the API (excluding OTHER which is not a real currency)
const API_CURRENCIES = ['NOK', 'USD', 'EUR', 'GBP', 'SEK', 'DKK'] as const

/**
 * Check if cached data is still valid
 */
function isCacheValid(cache: ExchangeRateCache): boolean {
  if (!cache.lastUpdated) return false

  const lastUpdated = new Date(cache.lastUpdated)
  const now = new Date()
  const timeDiff = now.getTime() - lastUpdated.getTime()

  return timeDiff < CACHE_DURATION
}

/**
 * Get cached exchange rates from localStorage
 */
function getCachedRates(): ExchangeRateCache | null {
  try {
    if (typeof window === 'undefined') return null

    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const cache: ExchangeRateCache = JSON.parse(cached)

    if (isCacheValid(cache)) {
      return cache
    }

    // Cache is expired, remove it
    localStorage.removeItem(CACHE_KEY)
    return null
  } catch (error) {
    console.warn('Failed to read exchange rate cache:', error)
    return null
  }
}

/**
 * Save exchange rates to localStorage cache
 */
function cacheRates(
  rates: Record<string, Record<string, number>>,
  baseCurrency: string,
): void {
  try {
    if (typeof window === 'undefined') return

    const cache: ExchangeRateCache = {
      rates,
      lastUpdated: new Date().toISOString(),
      baseCurrency,
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (error) {
    console.warn('Failed to cache exchange rates:', error)
  }
}

/**
 * Fetch exchange rates from API for a specific base currency
 */
async function fetchExchangeRatesFromAPI(
  baseCurrency: string,
): Promise<Record<string, number> | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_EXCHANGE_RATE_API_KEY

    // Construct URL based on whether we have an API key
    const url = apiKey
      ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`
      : `https://open.er-api.com/v6/latest/${baseCurrency}`

    if (!apiKey) {
      console.warn(
        'Exchange rate API key not configured, using open access tier (rate limited)',
      )
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(TIMEOUTS.exchangeRateApi),
    })

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(
          'Exchange rate API rate limit exceeded, using cached/fallback rates',
        )
      } else {
        console.warn(
          `Exchange rate API error: ${response.status} ${response.statusText}`,
        )
      }
      return null
    }

    const data = await response.json()

    // Both open access and paid tiers use v6 format with 'rates' field
    if (data.result === 'success' && data.rates) {
      return data.rates
    } else {
      console.warn('Exchange rate API returned unexpected format:', data)
      return null
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.warn(
        'Exchange rate API request timed out, using cached/fallback rates',
      )
    } else {
      console.warn('Failed to fetch exchange rates:', error)
    }
    return null
  }
}

/**
 * Build complete exchange rate matrix from multiple base currencies
 */
async function buildExchangeRateMatrix(): Promise<
  Record<string, Record<string, number>>
> {
  const matrix: Record<string, Record<string, number>> = {}

  // Try to fetch rates for each currency as base
  for (const baseCurrency of API_CURRENCIES) {
    const rates = await fetchExchangeRatesFromAPI(baseCurrency)

    if (rates) {
      // Filter to only include our supported currencies
      const filteredRates: Record<string, number> = {}
      for (const currency of API_CURRENCIES) {
        if (rates[currency] !== undefined) {
          filteredRates[currency] = rates[currency]
        }
      }

      // Add OTHER currency (always 1:1 conversion)
      filteredRates.OTHER = 1

      matrix[baseCurrency] = filteredRates
    } else {
      // Use fallback rates for this base currency
      matrix[baseCurrency] = FALLBACK_RATES[baseCurrency as SupportedCurrency]
    }

    // Add small delay to avoid hitting rate limits
    await new Promise((resolve) =>
      setTimeout(resolve, EXCHANGE_RATE_CONFIG.apiCallDelay),
    )
  }

  // Add OTHER currency conversions (always 1:1)
  matrix.OTHER = FALLBACK_RATES.OTHER

  return matrix
}

/**
 * Get current exchange rates with caching
 */
export async function getExchangeRates(): Promise<
  Record<SupportedCurrency, Record<SupportedCurrency, number>>
> {
  // Check cache first
  const cached = getCachedRates()
  if (cached) {
    console.log('Using cached exchange rates from', cached.lastUpdated)
    return cached.rates as Record<
      SupportedCurrency,
      Record<SupportedCurrency, number>
    >
  }

  console.log('Fetching fresh exchange rates from API...')

  try {
    // Fetch fresh rates
    const matrix = await buildExchangeRateMatrix()

    // Cache the results
    cacheRates(matrix, 'multiple')

    return matrix as Record<
      SupportedCurrency,
      Record<SupportedCurrency, number>
    >
  } catch (error) {
    console.warn('Failed to fetch exchange rates, using fallback rates:', error)
    return FALLBACK_RATES
  }
}

/**
 * Convert currency amount using cached exchange rates
 */
export function convertCurrency(
  amount: number,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  exchangeRates: Record<SupportedCurrency, Record<SupportedCurrency, number>>,
): number {
  if (fromCurrency === toCurrency) return amount

  const rate = exchangeRates[fromCurrency]?.[toCurrency]
  if (rate === undefined) {
    console.warn(
      `No exchange rate found for ${fromCurrency} to ${toCurrency}, using 1:1`,
    )
    return amount
  }

  return amount * rate
}

/**
 * Clear exchange rate cache (useful for testing or manual refresh)
 */
export function clearExchangeRateCache(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CACHE_KEY)
    }
  } catch (error) {
    console.warn('Failed to clear exchange rate cache:', error)
  }
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(): {
  cached: boolean
  lastUpdated?: string
  nextUpdate?: string
} {
  const cached = getCachedRates()

  if (!cached) {
    return { cached: false }
  }

  const lastUpdated = new Date(cached.lastUpdated)
  const nextUpdate = new Date(lastUpdated.getTime() + CACHE_DURATION)

  return {
    cached: true,
    lastUpdated: lastUpdated.toISOString(),
    nextUpdate: nextUpdate.toISOString(),
  }
}
