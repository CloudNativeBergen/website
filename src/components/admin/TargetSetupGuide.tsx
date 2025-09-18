'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import {
  CogIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/16/solid'
import { api } from '@/lib/trpc/client'
import type {
  TicketTargetConfig,
  SalesMilestone,
  TargetCurve,
} from '@/lib/tickets/types'

interface TargetSetupGuideProps {
  conferenceId: string
  hasCapacity: boolean
  hasTargetConfig: boolean
  currentCapacity?: number
}

/**
 * Enhanced component to guide users through setting up ticket target tracking
 * with direct API integration for immediate configuration
 */
export function TargetSetupGuide({
  conferenceId,
  hasCapacity,
  hasTargetConfig,
  currentCapacity,
}: TargetSetupGuideProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isConfiguring, setIsConfiguring] = useState(false)
  const [capacity, setCapacity] = useState(currentCapacity || 100)
  const [config, setConfig] = useState<TicketTargetConfig>({
    enabled: false,
    sales_start_date: new Date().toISOString().split('T')[0],
    target_curve: 'linear',
    milestones: [],
  })
  const router = useRouter()

  const updateSettings = api.tickets.updateSettings.useMutation({
    onSuccess: () => {
      // Use router.refresh() to refresh server components
      router.refresh()
      setIsExpanded(false) // Close the setup guide
      setIsConfiguring(false)
    },
    onError: (error) => {
      console.error('Failed to update settings:', error)
      setIsConfiguring(false)
    },
  })

  const steps = [
    {
      id: 'capacity',
      title: 'Set Maximum Ticket Capacity',
      completed: hasCapacity,
      description: 'Define the total number of tickets available for sale',
      action: 'Set capacity',
    },
    {
      id: 'config',
      title: 'Configure Target Tracking',
      completed: hasTargetConfig,
      description: 'Enable target tracking and set progression parameters',
      action: 'Configure targets',
    },
  ]

  const completedSteps = steps.filter((step) => step.completed).length
  const isFullyConfigured = completedSteps === steps.length

  const handleQuickSetup = async () => {
    setIsConfiguring(true)
    try {
      await updateSettings.mutateAsync({
        conferenceId,
        ticket_capacity: capacity,
        ticket_targets: {
          ...config,
          enabled: true,
        },
      })
    } catch (error) {
      console.error('Failed to setup ticket targets:', error)
    } finally {
      setIsConfiguring(false)
    }
  }

  const addMilestone = () => {
    const newMilestone: SalesMilestone = {
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0], // 30 days from now
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
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
      <div className="px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <CogIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Target Tracking Setup
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {completedSteps}/{steps.length} steps completed
                </span>
                {isFullyConfigured && (
                  <CheckCircleIcon className="h-4 w-4 text-green-500" />
                )}
              </div>
            </div>
          </div>

          <Button
            onClick={() => setIsExpanded(!isExpanded)}
            variant="outline"
            size="sm"
          >
            {isExpanded ? 'Hide Setup' : 'Configure'}
          </Button>
        </div>

        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Set up ticket sales targets to track progress and visualize
          performance over time
        </p>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-6 dark:border-gray-800 dark:bg-gray-900/50">
          <div className="space-y-8">
            {/* Capacity Configuration */}
            <div className="space-y-3">
              <label
                htmlFor="ticket-capacity"
                className="block text-sm/6 font-medium text-gray-900 dark:text-white"
              >
                Maximum Ticket Capacity
              </label>
              <div className="space-y-2">
                <input
                  id="ticket-capacity"
                  type="number"
                  min="1"
                  max="10000"
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value) || 0)}
                  className="block w-full max-w-xs rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-blue-500"
                  placeholder="e.g., 500"
                />
                <p className="text-xs/5 text-gray-500 dark:text-gray-400">
                  Total number of tickets available for sale (excluding
                  sponsor/speaker tickets)
                </p>
              </div>
            </div>

            {/* Target Configuration */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="group grid size-4 grid-cols-1">
                  <input
                    id="enable-tracking"
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) =>
                      setConfig({ ...config, enabled: e.target.checked })
                    }
                    className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-blue-600 checked:bg-blue-600 indeterminate:border-blue-600 indeterminate:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:checked:border-blue-500 dark:checked:bg-blue-500 dark:focus-visible:outline-blue-500 forced-colors:appearance-auto"
                  />
                  <CheckIcon className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white opacity-0 group-has-checked:opacity-100 group-has-disabled:stroke-white/25" />
                </div>
                <label
                  htmlFor="enable-tracking"
                  className="text-sm/6 font-medium text-gray-900 dark:text-white"
                >
                  Enable target tracking
                </label>
              </div>

              {config.enabled && (
                <div className="ml-7 space-y-6 border-l-2 border-blue-100 pl-6 dark:border-blue-900/50">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="sales-start-date"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Sales Start Date
                      </label>
                      <input
                        id="sales-start-date"
                        type="date"
                        value={config.sales_start_date || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            sales_start_date: e.target.value,
                          })
                        }
                        className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:focus:outline-blue-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="target-curve"
                        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
                      >
                        Target Progression Curve
                      </label>
                      <div className="grid grid-cols-1">
                        <select
                          id="target-curve"
                          value={config.target_curve || 'linear'}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              target_curve: e.target.value as TargetCurve,
                            })
                          }
                          className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 *:bg-gray-50 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus:outline-blue-500"
                        >
                          <option value="linear">
                            Linear - Steady progression
                          </option>
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
                        <ChevronDownIcon className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4" />
                      </div>
                    </div>
                  </div>

                  {/* Milestones */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                        Sales Milestones
                        <span className="ml-1 text-xs/5 text-gray-500 dark:text-gray-400">
                          (Optional)
                        </span>
                      </label>
                      <Button
                        onClick={addMilestone}
                        variant="outline"
                        size="sm"
                        type="button"
                        className="gap-1"
                      >
                        <PlusIcon className="h-4 w-4" />
                        Add Milestone
                      </Button>
                    </div>

                    {(config.milestones || []).length > 0 && (
                      <div className="space-y-3">
                        {(config.milestones || []).map((milestone, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-4 dark:border-gray-700 dark:bg-gray-800"
                          >
                            <div>
                              <label className="mb-1 block text-xs/5 font-medium text-gray-700 dark:text-gray-300">
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
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:focus:outline-blue-500"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs/5 font-medium text-gray-700 dark:text-gray-300">
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
                                    target_percentage:
                                      parseInt(e.target.value) || 0,
                                  })
                                }
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-blue-500"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs/5 font-medium text-gray-700 dark:text-gray-300">
                                Label
                              </label>
                              <input
                                type="text"
                                placeholder="Optional"
                                value={milestone.label || ''}
                                onChange={(e) =>
                                  updateMilestone(index, {
                                    ...milestone,
                                    label: e.target.value,
                                  })
                                }
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-blue-500"
                              />
                            </div>
                            <div className="flex items-end">
                              <Button
                                onClick={() => removeMilestone(index)}
                                variant="outline"
                                size="sm"
                                type="button"
                                className="w-full text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-center border-t border-gray-200 pt-6 dark:border-gray-700">
              <Button
                onClick={handleQuickSetup}
                disabled={isConfiguring || capacity < 1}
                size="md"
                className="min-w-[200px]"
              >
                {isConfiguring
                  ? 'Saving Configuration...'
                  : 'Save Configuration'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
