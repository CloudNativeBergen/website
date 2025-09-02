import { useState, useEffect } from 'react'
import type { SupportedCurrency } from '@/lib/travel-support/types'
import {
  getExchangeRates,
  convertCurrency,
} from '@/lib/travel-support/exchange-rates'

interface UseExchangeRatesReturn {
  exchangeRates: Record<
    SupportedCurrency,
    Record<SupportedCurrency, number>
  > | null
  isLoading: boolean
  error: string | null
  convertCurrency: (
    amount: number,
    from: SupportedCurrency,
    to: SupportedCurrency,
  ) => number
  refreshRates: () => Promise<void>
}

/**
 * React hook for managing exchange rates with caching
 */
export function useExchangeRates(): UseExchangeRatesReturn {
  const [exchangeRates, setExchangeRates] = useState<Record<
    SupportedCurrency,
    Record<SupportedCurrency, number>
  > | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadExchangeRates = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const rates = await getExchangeRates()
      setExchangeRates(rates)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load exchange rates'
      setError(errorMessage)
      console.error('Error loading exchange rates:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshRates = async () => {
    // Clear cache and reload
    if (typeof window !== 'undefined') {
      localStorage.removeItem('exchange_rates_cache')
    }
    await loadExchangeRates()
  }

  // Load exchange rates on mount
  useEffect(() => {
    loadExchangeRates()
  }, [])

  // Currency conversion function
  const convertCurrencyWithRates = (
    amount: number,
    from: SupportedCurrency,
    to: SupportedCurrency,
  ): number => {
    if (!exchangeRates) {
      // Fallback conversion if rates aren't loaded yet
      if (from === to) return amount
      console.warn('Exchange rates not loaded, using 1:1 conversion')
      return amount
    }

    return convertCurrency(amount, from, to, exchangeRates)
  }

  return {
    exchangeRates,
    isLoading,
    error,
    convertCurrency: convertCurrencyWithRates,
    refreshRates,
  }
}
