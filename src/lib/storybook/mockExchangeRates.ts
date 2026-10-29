import { EXCHANGE_RATE_CONFIG } from '@/lib/travel-support/config'
import { FALLBACK_RATES } from '@/lib/travel-support/exchange-rates'

/**
 * Story `beforeEach` that seeds a fresh exchange-rate cache with the fixed
 * fallback rates, so `useExchangeRates()` never hits the network and values
 * are deterministic. Restores whatever was cached before in its cleanup.
 */
export function mockExchangeRatesBeforeEach(): () => () => void {
  return () => {
    const key = EXCHANGE_RATE_CONFIG.cacheKey
    const previous = localStorage.getItem(key)
    localStorage.setItem(
      key,
      JSON.stringify({
        rates: FALLBACK_RATES,
        lastUpdated: new Date().toISOString(),
        baseCurrency: 'multiple',
      }),
    )
    return () => {
      if (previous === null) localStorage.removeItem(key)
      else localStorage.setItem(key, previous)
    }
  }
}
