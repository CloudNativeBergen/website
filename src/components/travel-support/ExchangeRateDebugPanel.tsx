'use client'

import { useState, useEffect } from 'react'
import {
  ChevronUpIcon,
  ChevronDownIcon,
  XMarkIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import {
  getCacheStatus,
  clearExchangeRateCache,
} from '@/lib/travel-support/exchange-rates'
import type { SupportedCurrency } from '@/lib/travel-support/types'

export function ExchangeRateDebugPanel() {
  const { exchangeRates, isLoading, error, convertCurrency, refreshRates } =
    useExchangeRates()
  const [cacheStatus, setCacheStatus] = useState(() => getCacheStatus())
  const [testAmount, setTestAmount] = useState(100)
  const [fromCurrency, setFromCurrency] = useState<SupportedCurrency>('USD')
  const [toCurrency, setToCurrency] = useState<SupportedCurrency>('NOK')

  const [isVisible, setIsVisible] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)

  useEffect(() => {
    try {
      const savedVisible = localStorage.getItem('debug-panel-visible')
      const savedMinimized = localStorage.getItem('debug-panel-minimized')

      if (savedVisible !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore visibility from localStorage
        setIsVisible(JSON.parse(savedVisible))
      }
      if (savedMinimized !== null) {
        setIsMinimized(JSON.parse(savedMinimized))
      }
    } catch (error) {
      console.warn('Failed to load debug panel state:', error)
    }
  }, [])

  const handleVisibilityChange = (visible: boolean) => {
    setIsVisible(visible)
    try {
      localStorage.setItem('debug-panel-visible', JSON.stringify(visible))
    } catch {}
  }

  const handleMinimizeChange = (minimized: boolean) => {
    setIsMinimized(minimized)
    try {
      localStorage.setItem('debug-panel-minimized', JSON.stringify(minimized))
    } catch {}
  }

  const refreshCacheStatus = () => {
    setCacheStatus(getCacheStatus())
  }

  const clearCache = () => {
    clearExchangeRateCache()
    refreshCacheStatus()
    refreshRates()
  }

  const currencies: SupportedCurrency[] = [
    'NOK',
    'USD',
    'EUR',
    'GBP',
    'SEK',
    'DKK',
    'OTHER',
  ]

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  if (!isVisible) {
    return (
      <button
        onClick={() => handleVisibilityChange(true)}
        className="fixed right-4 bottom-20 z-50 rounded-full bg-blue-600 p-3 text-white shadow-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        title="Show Exchange Rate Debug Panel"
      >
        <CurrencyDollarIcon className="h-5 w-5" />
      </button>
    )
  }

  return (
    <div
      className={`fixed right-4 bottom-20 z-50 w-96 rounded-lg border border-gray-300 bg-white font-mono text-xs shadow-lg dark:border-gray-600 dark:bg-gray-800 ${
        isMinimized ? '' : 'max-h-96 overflow-y-auto'
      }`}
    >
      <div className="flex items-center justify-between p-4 pb-2">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          Exchange Rate Debug
        </h3>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => handleMinimizeChange(!isMinimized)}
            className="rounded p-1 text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title={isMinimized ? 'Expand panel' : 'Minimize panel'}
          >
            {isMinimized ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => handleVisibilityChange(false)}
            className="rounded p-1 text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title="Hide panel"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-4 pt-0">
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={refreshCacheStatus}
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Refresh Status
            </button>
          </div>

          <div className="mb-3 rounded bg-gray-50 p-2 dark:bg-gray-700">
            <div className="mb-1 font-semibold text-gray-900 dark:text-gray-100">
              Status:
            </div>
            <div className="text-gray-800 dark:text-gray-200">
              Loading: {isLoading ? 'Yes' : 'No'}
            </div>
            <div className="text-gray-800 dark:text-gray-200">
              Error: {error || 'None'}
            </div>
            <div className="text-gray-800 dark:text-gray-200">
              Cached: {cacheStatus.cached ? 'Yes' : 'No'}
            </div>
            {cacheStatus.lastUpdated && (
              <div className="text-gray-800 dark:text-gray-200">
                Last Updated:{' '}
                {new Date(cacheStatus.lastUpdated).toLocaleString()}
              </div>
            )}
            {cacheStatus.nextUpdate && (
              <div className="text-gray-800 dark:text-gray-200">
                Next Update: {new Date(cacheStatus.nextUpdate).toLocaleString()}
              </div>
            )}
          </div>

          <div className="mb-3 space-y-2">
            <button
              onClick={refreshRates}
              disabled={isLoading}
              className="w-full rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {isLoading ? 'Loading...' : 'Refresh Rates'}
            </button>
            <button
              onClick={clearCache}
              className="w-full rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
            >
              Clear Cache
            </button>
          </div>

          <div className="mb-3 rounded bg-gray-50 p-2 dark:bg-gray-700">
            <div className="mb-2 font-semibold text-gray-900 dark:text-gray-100">
              Test Converter:
            </div>
            <div className="mb-2 grid grid-cols-3 gap-1">
              <input
                type="number"
                value={testAmount}
                onChange={(e) => setTestAmount(Number(e.target.value))}
                className="rounded border border-gray-300 bg-white px-1 py-1 text-center text-gray-900 dark:border-gray-500 dark:bg-gray-600 dark:text-gray-100"
                placeholder="Amount"
              />
              <select
                value={fromCurrency}
                onChange={(e) =>
                  setFromCurrency(e.target.value as SupportedCurrency)
                }
                className="rounded border border-gray-300 bg-white px-1 py-1 text-gray-900 dark:border-gray-500 dark:bg-gray-600 dark:text-gray-100"
              >
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              <select
                value={toCurrency}
                onChange={(e) =>
                  setToCurrency(e.target.value as SupportedCurrency)
                }
                className="rounded border border-gray-300 bg-white px-1 py-1 text-gray-900 dark:border-gray-500 dark:bg-gray-600 dark:text-gray-100"
              >
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded border border-gray-300 bg-white p-2 text-center text-gray-900 dark:border-gray-500 dark:bg-gray-600 dark:text-gray-100">
              {testAmount} {fromCurrency} ={' '}
              {convertCurrency(testAmount, fromCurrency, toCurrency).toFixed(2)}{' '}
              {toCurrency}
            </div>
          </div>

          {exchangeRates && (
            <div className="rounded bg-gray-50 p-2 dark:bg-gray-700">
              <div className="mb-1 font-semibold text-gray-900 dark:text-gray-100">
                Current Rates (NOK base):
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {Object.entries(exchangeRates.NOK).map(([currency, rate]) => (
                  <div
                    key={currency}
                    className="flex justify-between text-gray-800 dark:text-gray-200"
                  >
                    <span>1 NOK =</span>
                    <span>
                      {rate.toFixed(4)} {currency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded bg-yellow-50 p-2 text-xs dark:bg-yellow-900/30">
            <div className="mb-1 font-semibold text-gray-900 dark:text-gray-100">
              Exchange Rate Info:
            </div>
            <div className="text-gray-800 dark:text-gray-200">
              {exchangeRates && fromCurrency !== toCurrency && (
                <div className="mb-1">
                  Current rate: 1 {fromCurrency} ={' '}
                  {exchangeRates[fromCurrency]?.[toCurrency]?.toFixed(4) ||
                    'N/A'}{' '}
                  {toCurrency}
                </div>
              )}
              <div>
                API:{' '}
                {process.env.NEXT_PUBLIC_EXCHANGE_RATE_API_KEY
                  ? 'Paid tier (1,500 requests/month)'
                  : '⚠️ Open access (rate limited - add API key for more requests)'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
