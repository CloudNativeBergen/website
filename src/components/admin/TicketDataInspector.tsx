'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'

export function TicketDataInspector() {
  const [selectedTab, setSelectedTab] = useState<
    'overview' | 'raw' | 'sample' | 'transformed' | 'api'
  >('overview')
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({})
  const [showCleanedData, setShowCleanedData] = useState(true)

  // Fetch debug data using tRPC
  const {
    data: debugData,
    isLoading,
    error,
    refetch,
  } = api.tickets.getDebugData.useQuery()

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Clean ticket data by removing unnecessary fields
  const cleanTicketData = (data: unknown): unknown => {
    if (Array.isArray(data)) {
      return data.map(cleanTicketData)
    }

    if (data && typeof data === 'object') {
      const cleaned = { ...data } as Record<string, unknown>

      // Remove unnecessary fields
      delete cleaned.barcode
      delete cleaned.courseCertificateSentAt
      delete cleaned.courseCertificateStatus

      // Clean ticket object
      if (cleaned.ticket && typeof cleaned.ticket === 'object') {
        const ticketCleaned = { ...cleaned.ticket } as Record<string, unknown>
        delete ticketCleaned.discount // Always true, not useful
        delete ticketCleaned.fee // Always null, not useful
        cleaned.ticket = ticketCleaned
      }

      // Recursively clean nested objects
      Object.keys(cleaned).forEach((key) => {
        if (cleaned[key] && typeof cleaned[key] === 'object') {
          cleaned[key] = cleanTicketData(cleaned[key])
        }
      })

      return cleaned
    }

    return data
  }

  const renderJSON = (data: unknown, title: string, shouldClean = true) => {
    const isExpanded = expandedSections[title] || false
    const displayData = shouldClean ? cleanTicketData(data) : data

    return (
      <div className="rounded-lg border bg-gray-50 p-4 dark:bg-gray-900">
        <div
          className="mb-2 flex cursor-pointer items-center justify-between"
          onClick={() => toggleSection(title)}
        >
          <h4 className="font-medium text-gray-900 dark:text-white">{title}</h4>
          <span className="text-gray-500">{isExpanded ? '−' : '+'}</span>
        </div>
        {isExpanded && (
          <pre className="max-h-96 overflow-auto rounded border bg-white p-3 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {JSON.stringify(displayData, null, 2)}
          </pre>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center space-x-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
          <span>Loading debug data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <h3 className="mb-2 text-lg font-semibold text-red-800 dark:text-red-200">
            Error Loading Debug Data
          </h3>
          <p className="text-red-600 dark:text-red-300">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="mt-3 rounded bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!debugData) {
    return (
      <div className="p-6 text-center text-gray-500">
        No debug data available
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Ticket Data Inspector
        </h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showCleanedData}
              onChange={(e) => setShowCleanedData(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-700 dark:text-gray-300">
              Clean data (remove barcode, discount, fee, etc.)
            </span>
          </label>
          <button
            onClick={() => refetch()}
            className="rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            Refresh Data
          </button>
        </div>
      </div>

      {/* Conference Info */}
      <div className="rounded-lg border bg-white p-6 dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold">Conference Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="font-medium">Title:</span>{' '}
            {debugData.conferenceInfo.title}
          </div>
          <div>
            <span className="font-medium">Domain:</span>{' '}
            {debugData.conferenceInfo.domain}
          </div>
          <div>
            <span className="font-medium">Checkin Configured:</span>
            <span
              className={`ml-2 rounded px-2 py-1 text-sm ${
                debugData.conferenceInfo.hasCheckinConfig
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
              }`}
            >
              {debugData.conferenceInfo.hasCheckinConfig ? 'Yes' : 'No'}
            </span>
          </div>
          {debugData.conferenceInfo.checkin_customer_id && (
            <div>
              <span className="font-medium">Customer ID:</span>{' '}
              {debugData.conferenceInfo.checkin_customer_id}
            </div>
          )}
          {debugData.conferenceInfo.checkin_event_id && (
            <div>
              <span className="font-medium">Event ID:</span>{' '}
              {debugData.conferenceInfo.checkin_event_id}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'raw', label: 'Raw Data' },
            { id: 'sample', label: 'Sample Tickets' },
            { id: 'transformed', label: 'Transformed Data' },
            { id: 'api', label: 'API Response' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setSelectedTab(
                  tab.id as
                    | 'overview'
                    | 'raw'
                    | 'sample'
                    | 'transformed'
                    | 'api',
                )
              }
              className={`border-b-2 px-1 py-2 text-sm font-medium ${
                selectedTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {selectedTab === 'overview' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Data Overview</h3>

            {debugData.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                <h4 className="font-medium text-red-800 dark:text-red-200">
                  API Error
                </h4>
                <p className="text-red-600 dark:text-red-300">
                  {debugData.error}
                </p>
              </div>
            )}

            {debugData.ticketData && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {debugData.ticketData.totalCount}
                  </div>
                  <div className="text-sm text-blue-800 dark:text-blue-300">
                    Total Tickets
                  </div>
                </div>
                <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {debugData.ticketData.paidTickets}
                  </div>
                  <div className="text-sm text-green-800 dark:text-green-300">
                    Paid Tickets
                  </div>
                </div>
                <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {debugData.ticketData.ticketsWithDates}
                  </div>
                  <div className="text-sm text-yellow-800 dark:text-yellow-300">
                    With Dates
                  </div>
                </div>
                <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {debugData.ticketData.priceDataAvailable}
                  </div>
                  <div className="text-sm text-purple-800 dark:text-purple-300">
                    With Price Data
                  </div>
                </div>
              </div>
            )}

            {debugData.ticketData?.ticketCategories && (
              <div>
                <h4 className="mb-2 font-medium">Ticket Categories</h4>
                <div className="flex flex-wrap gap-2">
                  {debugData.ticketData.ticketCategories.map(
                    (category, index) => (
                      <span
                        key={index}
                        className="rounded-full bg-gray-100 px-3 py-1 text-sm dark:bg-gray-700"
                      >
                        {category}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'raw' && debugData.ticketData && (
          <div className="space-y-4">
            {renderJSON(
              debugData.ticketData,
              'Complete Ticket Data',
              showCleanedData,
            )}
          </div>
        )}

        {selectedTab === 'sample' && debugData.ticketData?.rawSamples && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Sample Tickets (First 3)</h3>
            {debugData.ticketData.rawSamples.map((ticket, index) =>
              renderJSON(ticket, `Ticket ${index + 1}`, showCleanedData),
            )}
          </div>
        )}

        {selectedTab === 'transformed' && debugData.transformedData && (
          <div className="space-y-4">
            {renderJSON(
              debugData.transformedData,
              'Transformed Chart Data',
              false,
            )}
          </div>
        )}

        {selectedTab === 'api' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">API Response Details</h3>
            {renderJSON(debugData, 'Complete Debug Response', false)}
          </div>
        )}
      </div>
    </div>
  )
}

export default TicketDataInspector
