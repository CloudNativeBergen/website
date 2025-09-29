'use client'

import { api } from '@/lib/trpc/client'
import { useState } from 'react'

export default function WorkshopDebugPage() {
  const [conferenceId, setConferenceId] = useState('d02570e5-7fb6-46e0-a0a1-d27bbbb0a3b5')

  const { data: debugData, refetch } = api.workshop.debugTalks.useQuery(
    { conferenceId },
    { enabled: !!conferenceId }
  )

  const { data: workshopsData } = api.workshop.listWorkshops.useQuery(
    { conferenceId, includeCapacity: true },
    { enabled: !!conferenceId }
  )

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Workshop Debug Page</h1>

      <div className="mb-4">
        <label className="block mb-2">Conference ID:</label>
        <input
          type="text"
          value={conferenceId}
          onChange={(e) => setConferenceId(e.target.value)}
          className="border p-2 w-full"
        />
        <button
          onClick={() => refetch()}
          className="mt-2 bg-blue-500 text-white px-4 py-2 rounded"
        >
          Refresh
        </button>
      </div>

      {debugData && (
        <div className="space-y-4">
          <div className="bg-gray-100 p-4 rounded">
            <h2 className="font-bold mb-2">Summary:</h2>
            <p>Conference ID being queried: {debugData.conferenceIdUsed}</p>
            <p>Total talks in entire system: {debugData.allTalksInSystem}</p>
            <p>Total talks in conference: {debugData.allTalks}</p>
            <p>Talks matching alt query: {debugData.talksMatchingAltQuery}</p>
            <p>Talks with workshop format: {debugData.workshopFormatTalks}</p>
            <p>Confirmed workshops: {debugData.confirmedWorkshops}</p>
          </div>

          {debugData.details.firstSystemTalks.length > 0 && (
            <div className="bg-gray-100 p-4 rounded">
              <h2 className="font-bold mb-2">Sample System Talks (showing conference refs):</h2>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(debugData.details.firstSystemTalks, null, 2)}
              </pre>
            </div>
          )}

          {debugData.details.allTalks.length > 0 && (
            <div className="bg-gray-100 p-4 rounded">
              <h2 className="font-bold mb-2">Sample Talks (first 5):</h2>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(debugData.details.allTalks, null, 2)}
              </pre>
            </div>
          )}

          {debugData.details.workshopTalks.length > 0 && (
            <div className="bg-gray-100 p-4 rounded">
              <h2 className="font-bold mb-2">Workshop Format Talks:</h2>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(debugData.details.workshopTalks, null, 2)}
              </pre>
            </div>
          )}

          <div className="bg-gray-100 p-4 rounded">
            <h2 className="font-bold mb-2">Regular Workshop Query Result:</h2>
            <p>Workshops found: {workshopsData?.data?.length || 0}</p>
            {workshopsData?.data && (
              <pre className="text-xs overflow-auto">
                {JSON.stringify(workshopsData.data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}