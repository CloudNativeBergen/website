'use client'

import { useEffect, useState } from 'react'
import { CalendarIcon } from '@heroicons/react/24/outline'
import { ScheduleEditor } from '@/components/schedule/ScheduleEditor'
import { useScheduleEditor } from '@/hooks/useScheduleEditor'
import {
  fetchConfirmedProposals,
  fetchSchedule,
  saveSchedule,
} from '@/lib/schedule/client'
import { ProposalExisting } from '@/lib/proposal/types'
import { ConferenceSchedule } from '@/lib/conference/types'

export default function AdminSchedule() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scheduleEditor = useScheduleEditor()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Load confirmed proposals and existing schedule in parallel
      const [proposalsResponse, scheduleResponse] = await Promise.all([
        fetchConfirmedProposals(),
        fetchSchedule(),
      ])

      if (proposalsResponse.error) {
        setError(proposalsResponse.error.message)
        return
      }

      if (scheduleResponse.error) {
        setError(scheduleResponse.error.message)
        return
      }

      scheduleEditor.setInitialData(
        scheduleResponse.schedule || null,
        proposalsResponse.proposals || [],
      )
    } catch (err) {
      setError('Failed to load data')
      console.error('Error loading schedule data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!scheduleEditor.schedule) return

    setIsSaving(true)
    try {
      const response = await saveSchedule(scheduleEditor.schedule)
      if (response.error) {
        setError(response.error.message)
      } else {
        // Optionally show success message
        console.log('Schedule saved successfully')
      }
    } catch (err) {
      setError('Failed to save schedule')
      console.error('Error saving schedule:', err)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto h-full max-w-7xl">
        <div className="border-b border-gray-200 pb-5">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-8 w-8 text-gray-400" />
            <div>
              <h1 className="text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Schedule Management
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Create and manage the conference schedule
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-500">Loading schedule data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto h-full max-w-7xl">
        <div className="border-b border-gray-200 pb-5">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-8 w-8 text-gray-400" />
            <div>
              <h1 className="text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Schedule Management
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Create and manage the conference schedule
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-800">{error}</p>
            <button
              onClick={loadData}
              className="mt-4 rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ScheduleEditor
        scheduleEditor={scheduleEditor}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  )
}
