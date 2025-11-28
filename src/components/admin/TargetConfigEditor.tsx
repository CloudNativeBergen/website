'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import { CogIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import type { SalesTargetConfig } from '@/lib/tickets/types'
import { CurveSelectionGrid } from './CurvePreview'
import { getCurveMetadata } from '@/lib/tickets/curve-utils'

interface TargetConfigEditorProps {
  conferenceId: string
  currentConfig?: SalesTargetConfig
  capacity: number
  currentTicketsSold?: number
}

export function TargetConfigEditor({
  conferenceId,
  currentConfig,
  capacity,
  currentTicketsSold = 0,
}: TargetConfigEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const router = useRouter()

  const updateSettings = api.tickets.updateSettings.useMutation({
    onSuccess: () => {
      setIsEditing(false)

      router.refresh()
    },
    onError: (error) => {
      console.error('Failed to save settings:', error)
    },
  })

  const [config, setConfig] = useState<SalesTargetConfig>(() =>
    currentConfig
      ? currentConfig
      : {
          enabled: true,
          sales_start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          target_curve: 'late_push',
          milestones: [],
        },
  )

  const [editCapacity, setEditCapacity] = useState(capacity)

  const handleSave = async () => {
    if (!config.sales_start_date) return

    updateSettings.mutate({
      conferenceId,
      ticket_capacity: editCapacity,
      ticket_targets: config,
    })
  }

  const handleCancel = () => {
    setConfig(
      currentConfig || {
        enabled: true,
        sales_start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        target_curve: 'late_push',
        milestones: [],
      },
    )
    setEditCapacity(capacity)
    setIsEditing(false)
  }

  if (!isEditing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CogIcon className="h-5 w-5 text-gray-400" />
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Target Configuration
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Progress: {currentTicketsSold}/{capacity} tickets (
                {Math.round((currentTicketsSold / capacity) * 100)}%) | Curve:{' '}
                {getCurveMetadata(config.target_curve).name}
                {config.enabled ? ' | Tracking: ON' : ' | Tracking: OFF'}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-4 flex items-center gap-3">
        <CogIcon className="h-5 w-5 text-blue-600" />
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Edit Target Configuration
        </h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Ticket Capacity
          </label>
          <input
            type="number"
            min="1"
            value={editCapacity}
            onChange={(e) => setEditCapacity(parseInt(e.target.value) || 0)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Sales Start Date
          </label>
          <input
            type="date"
            value={config.sales_start_date}
            onChange={(e) =>
              setConfig({ ...config, sales_start_date: e.target.value })
            }
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Target Curve
          </label>
          <CurveSelectionGrid
            selected={config.target_curve}
            onSelect={(curve) => setConfig({ ...config, target_curve: curve })}
            disabled={updateSettings.isPending}
          />
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="enabled"
            checked={config.enabled}
            onChange={(e) =>
              setConfig({ ...config, enabled: e.target.checked })
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label
            htmlFor="enabled"
            className="text-sm text-gray-700 dark:text-gray-300"
          >
            Enable target tracking
          </label>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={
              updateSettings.isPending ||
              !config.sales_start_date ||
              editCapacity < 1
            }
            className="flex items-center gap-2"
          >
            <CheckIcon className="h-4 w-4" />
            {updateSettings.isPending ? 'Saving...' : 'Save'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={updateSettings.isPending}
            className="flex items-center gap-2"
          >
            <XMarkIcon className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
