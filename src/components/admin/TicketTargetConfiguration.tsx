'use client'

import { useState } from 'react'
import type {
  TicketTargetConfig,
  SalesMilestone,
  TargetCurve,
} from '@/lib/tickets/targets'
import { Button } from '@/components/Button'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

interface TicketTargetConfigProps {
  initialConfig?: TicketTargetConfig
  capacity: number
  onSave: (config: TicketTargetConfig) => void
  onCancel: () => void
}

/**
 * Component for configuring ticket sales targets
 * This would typically be integrated into the Sanity Studio or a dedicated admin interface
 */
export function TicketTargetConfiguration({
  initialConfig,
  capacity,
  onSave,
  onCancel,
}: TicketTargetConfigProps) {
  const [config, setConfig] = useState<TicketTargetConfig>(
    initialConfig || {
      enabled: false,
      target_curve: 'linear',
      milestones: [],
    },
  )

  const addMilestone = () => {
    const newMilestone: SalesMilestone = {
      date: new Date().toISOString().split('T')[0],
      target_percentage: 50,
      label: '',
    }
    setConfig({
      ...config,
      milestones: [...(config.milestones || []), newMilestone],
    })
  }

  const updateMilestone = (index: number, milestone: SalesMilestone) => {
    const milestones = [...(config.milestones || [])]
    milestones[index] = milestone
    setConfig({ ...config, milestones })
  }

  const removeMilestone = (index: number) => {
    const milestones = [...(config.milestones || [])]
    milestones.splice(index, 1)
    setConfig({ ...config, milestones })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-gray-700">
        <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
          Ticket Sales Target Configuration
        </h3>

        {/* Enable/Disable */}
        <div className="mb-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) =>
                setConfig({ ...config, enabled: e.target.checked })
              }
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Enable ticket sales target tracking
            </span>
          </label>
        </div>

        {config.enabled && (
          <>
            {/* Sales Start Date */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Sales Start Date
              </label>
              <input
                type="date"
                value={config.sales_start_date || ''}
                onChange={(e) =>
                  setConfig({ ...config, sales_start_date: e.target.value })
                }
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
              />
            </div>

            {/* Target Curve */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Target Progression Curve
              </label>
              <select
                value={config.target_curve || 'linear'}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    target_curve: e.target.value as TargetCurve,
                  })
                }
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
              >
                <option value="linear">Linear - Steady progression</option>
                <option value="early_push">
                  Early Push - Higher targets early on
                </option>
                <option value="late_push">
                  Late Push - Higher targets near the end
                </option>
                <option value="s_curve">
                  S-Curve - Slow start, rapid middle, slow end
                </option>
              </select>
            </div>

            {/* Milestones */}
            <div className="mb-6">
              <div className="mb-4 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Sales Milestones
                </label>
                <Button onClick={addMilestone} variant="outline" size="sm">
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add Milestone
                </Button>
              </div>

              <div className="space-y-3">
                {(config.milestones || []).map((milestone, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-4 dark:border-gray-700"
                  >
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        Date
                      </label>
                      <input
                        type="date"
                        value={milestone.date}
                        onChange={(e) =>
                          updateMilestone(index, {
                            ...milestone,
                            date: e.target.value,
                          })
                        }
                        className="block w-full rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-800"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        Target %
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={milestone.target_percentage}
                        onChange={(e) =>
                          updateMilestone(index, {
                            ...milestone,
                            target_percentage: parseInt(e.target.value) || 0,
                          })
                        }
                        className="block w-full rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-800"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        Label (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Early Bird End"
                        value={milestone.label || ''}
                        onChange={(e) =>
                          updateMilestone(index, {
                            ...milestone,
                            label: e.target.value,
                          })
                        }
                        className="block w-full rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-800"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={() => removeMilestone(index)}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <TrashIcon className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={() => onSave(config)}>Save Configuration</Button>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        </div>
      </div>

      {/* Preview/Info */}
      {config.enabled && (
        <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
          <h4 className="mb-2 text-sm font-medium text-blue-900 dark:text-blue-100">
            Configuration Summary
          </h4>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>• Capacity: {capacity} tickets</li>
            <li>• Curve: {config.target_curve}</li>
            <li>• Milestones: {config.milestones?.length || 0}</li>
            {config.sales_start_date && (
              <li>• Sales start: {config.sales_start_date}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
