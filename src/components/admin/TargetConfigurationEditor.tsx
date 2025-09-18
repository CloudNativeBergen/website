'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/Button'
import { CurveSelectionGrid } from './CurvePreview'
import {
  calculateCurveValue,
  getCurveMetadata,
} from '@/lib/tickets/target-calculations'
import {
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  InformationCircleIcon,
  ChartBarIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import type {
  ConferenceWithTargets,
  TicketTargetConfig,
  TargetCurve,
  TicketTargetAnalysis,
  TargetDataPoint,
  SalesDataPoint,
  TargetVsActualData,
} from '@/lib/tickets/types'

interface TargetConfigurationEditorProps {
  conference: ConferenceWithTargets
  onUpdate: (config: Partial<ConferenceWithTargets>) => Promise<void>
  isUpdating?: boolean
  onCancel?: () => void
  onPreviewChange?: (previewAnalysis: TicketTargetAnalysis | null) => void
  baseAnalysis?: TicketTargetAnalysis
}

interface MilestoneForm {
  id: string
  date: string
  label: string
  targetPercentage: number
}

/**
 * Format date for display
 */
const formatDate = (dateString: string): string => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Generate preview target analysis from form data
 */
function generatePreviewAnalysis(
  formData: {
    enabled: boolean
    capacity: number
    targetCurve: TargetCurve
    salesStartDate: string
    milestones: MilestoneForm[]
  },
  baseAnalysis?: TicketTargetAnalysis,
): TicketTargetAnalysis | null {
  if (!formData.enabled) return null

  const capacity = formData.capacity
  const config: TicketTargetConfig = {
    enabled: formData.enabled,
    target_curve: formData.targetCurve,
    sales_start_date: formData.salesStartDate,
    milestones: formData.milestones
      .filter((m) => m.date && m.label)
      .map((m) => ({
        date: m.date,
        label: m.label,
        target_percentage: m.targetPercentage,
      })),
  }

  // Generate preview target progression using existing dates for consistency
  const targets: TargetDataPoint[] = []
  const salesStart = config.sales_start_date
    ? new Date(config.sales_start_date)
    : new Date()

  if (baseAnalysis?.combinedData) {
    // Use existing dates and recalculate targets with new curve
    baseAnalysis.combinedData.forEach((point, index) => {
      const timeProgress = index / (12 - 1) // Match DEFAULT_TARGET_WEEKS - 1
      const progressionFactor = calculateCurveValue(
        timeProgress,
        config.target_curve || 'late_push',
      )
      const targetPercentage = progressionFactor * 100
      const targetTickets = Math.round((targetPercentage / 100) * capacity)

      targets.push({
        date: point.date,
        targetPercentage: targetPercentage,
        targetTickets: targetTickets,
      })
    })
  } else {
    // Fallback: generate new dates if no base analysis
    for (let week = 0; week < 12; week++) {
      const targetDate = new Date(salesStart)
      targetDate.setDate(targetDate.getDate() + week * 7)

      const progressionFactor = calculateCurveValue(
        week / (12 - 1),
        config.target_curve || 'late_push',
      )
      const targetPercentage = progressionFactor * 100
      const targetTickets = Math.round((targetPercentage / 100) * capacity)

      targets.push({
        date: targetDate.toISOString().split('T')[0],
        targetPercentage: targetPercentage,
        targetTickets: targetTickets,
      })
    }
  }

  const actualProgression: SalesDataPoint[] =
    baseAnalysis?.actualProgression || [
      {
        date: salesStart.toISOString().split('T')[0],
        paidTickets: 0,
        sponsorTickets: 0,
        speakerTickets: 0,
        totalTickets: 0,
        revenue: 0,
        categories: {},
      },
    ]

  // Keep actual sales data unchanged, only update targets
  const combinedData: TargetVsActualData[] = baseAnalysis?.combinedData
    ? baseAnalysis.combinedData.map((originalPoint) => {
        const targetForDate = targets.find((t) => t.date === originalPoint.date)

        return {
          ...originalPoint,
          target: targetForDate?.targetTickets || originalPoint.target,
        }
      })
    : targets.map((target) => {
        const actualData = actualProgression.find((a) => a.date === target.date)
        const actualTickets = actualData?.totalTickets || 0

        return {
          date: target.date,
          target: target.targetTickets,
          actual: actualTickets,
          actualPaid: actualData?.paidTickets || 0,
          actualSponsor: actualData?.sponsorTickets || 0,
          actualSpeaker: actualData?.speakerTickets || 0,
          categories: actualData?.categories || {},
          revenue: actualData?.revenue || 0,
        }
      })

  const currentSales = baseAnalysis?.currentSales || {
    date: new Date().toISOString().split('T')[0],
    paidTickets: 0,
    sponsorTickets: 0,
    speakerTickets: 0,
    totalTickets: 0,
    revenue: 0,
    categories: {},
  }

  return {
    config,
    capacity,
    currentSales,
    targetProgression: targets,
    actualProgression,
    combinedData,
    performance: {
      currentTargetPercentage: 0,
      actualPercentage: (currentSales.totalTickets / capacity) * 100,
      variance: 0,
      isOnTrack: true,
      nextMilestone: config.milestones?.[0],
      daysToNextMilestone: undefined,
    },
  }
}

const TARGET_CURVE_OPTIONS: Array<{
  value: TargetCurve
  label: string
  description: string
}> = [
  {
    value: 'linear',
    label: getCurveMetadata('linear').name,
    description: getCurveMetadata('linear').description,
  },
  {
    value: 'early_push',
    label: getCurveMetadata('early_push').name,
    description: getCurveMetadata('early_push').description,
  },
  {
    value: 'late_push',
    label: getCurveMetadata('late_push').name,
    description: getCurveMetadata('late_push').description,
  },
  {
    value: 's_curve',
    label: getCurveMetadata('s_curve').name,
    description: getCurveMetadata('s_curve').description,
  },
]

/**
 * Target Configuration Editor Component
 * Allows administrators to edit target settings directly from the admin page
 */
export function TargetConfigurationEditor({
  conference,
  onUpdate,
  isUpdating = false,
  onCancel,
  onPreviewChange,
  baseAnalysis,
}: TargetConfigurationEditorProps) {
  const [isCollapsed, setIsCollapsed] = useState(true) // Start collapsed by default
  const [formData, setFormData] = useState({
    enabled: conference.ticket_targets?.enabled || false,
    capacity: conference.ticket_capacity || 250,
    targetCurve:
      conference.ticket_targets?.target_curve || ('late_push' as TargetCurve),
    salesStartDate: conference.ticket_targets?.sales_start_date || '',
    milestones: [] as MilestoneForm[],
  })

  // Generate preview analysis when form data changes
  const previewAnalysis = useMemo(() => {
    // Only generate preview when expanded and enabled
    if (isCollapsed || !formData.enabled) return null
    return generatePreviewAnalysis(formData, baseAnalysis)
  }, [formData, baseAnalysis, isCollapsed])

  // Notify parent of preview changes
  useEffect(() => {
    if (onPreviewChange) {
      onPreviewChange(previewAnalysis)
    }
  }, [previewAnalysis, onPreviewChange])

  // Initialize milestones from conference data
  useEffect(() => {
    const existingMilestones = conference.ticket_targets?.milestones || []
    setFormData((prev) => ({
      ...prev,
      milestones: existingMilestones.map((milestone, index) => ({
        id: `milestone-${index}`,
        date: milestone.date,
        label: milestone.label || '',
        targetPercentage: milestone.target_percentage || 0,
      })),
    }))
  }, [conference.ticket_targets?.milestones])

  const handleFieldChange = (
    field: string,
    value: string | number | boolean | TargetCurve,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleMilestoneChange = (
    milestoneId: string,
    field: 'date' | 'label' | 'targetPercentage',
    value: string | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      milestones: prev.milestones.map((milestone) =>
        milestone.id === milestoneId
          ? { ...milestone, [field]: value }
          : milestone,
      ),
    }))
  }

  const addMilestone = () => {
    const newId = `milestone-${Date.now()}`
    setFormData((prev) => ({
      ...prev,
      milestones: [
        ...prev.milestones,
        {
          id: newId,
          date: '',
          label: '',
          targetPercentage: 0,
        },
      ],
    }))
  }

  const removeMilestone = (milestoneId: string) => {
    setFormData((prev) => ({
      ...prev,
      milestones: prev.milestones.filter(
        (milestone) => milestone.id !== milestoneId,
      ),
    }))
  }

  const handleSave = async () => {
    try {
      const updatedConfig: Partial<ConferenceWithTargets> = {
        ticket_capacity: formData.capacity,
        ticket_targets: {
          enabled: formData.enabled,
          target_curve: formData.targetCurve,
          sales_start_date: formData.salesStartDate,
          milestones: formData.milestones
            .filter((m) => m.date && m.label) // Only include complete milestones
            .map((m) => ({
              date: m.date,
              label: m.label,
              target_percentage: m.targetPercentage,
            })),
        },
      }

      await onUpdate(updatedConfig)

      // Collapse and clear preview after successful save
      setIsCollapsed(true)
      onPreviewChange?.(null)
    } catch (error) {
      console.error('Error updating target configuration:', error)
      // Error handling will be managed by the parent component
    }
  }

  const handleCancel = () => {
    // Reset form data to original values
    setFormData({
      enabled: conference.ticket_targets?.enabled || false,
      capacity: conference.ticket_capacity || 250,
      targetCurve: conference.ticket_targets?.target_curve || 'late_push',
      salesStartDate: conference.ticket_targets?.sales_start_date || '',
      milestones: (conference.ticket_targets?.milestones || []).map(
        (milestone, index) => ({
          id: `milestone-${index}`,
          date: milestone.date,
          label: milestone.label || '',
          targetPercentage: milestone.target_percentage || 0,
        }),
      ),
    })

    // Collapse and clear preview
    setIsCollapsed(true)
    onPreviewChange?.(null)
    onCancel?.()
  }

  const selectedCurveInfo = useMemo(() => {
    return TARGET_CURVE_OPTIONS.find(
      (option) => option.value === formData.targetCurve,
    )
  }, [formData.targetCurve])

  const isFormValid = useMemo(() => {
    if (!formData.enabled) return true // If disabled, no validation needed

    return (
      formData.capacity > 0 &&
      formData.salesStartDate !== '' &&
      formData.milestones.every((m) => m.date && m.label) // All milestones must be complete
    )
  }, [formData])

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      {isCollapsed ? (
        // Collapsed view with edit button
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <ChartBarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Target Configuration
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage ticket sales targets and milestone tracking
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-2"
          >
            <PencilIcon className="h-4 w-4" />
            Edit Configuration
          </Button>
        </div>
      ) : (
        // Expanded form view
        <>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <ChartBarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Target Configuration
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manage ticket sales targets and milestone tracking
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isUpdating}
                className="flex items-center gap-2"
              >
                <XMarkIcon className="h-4 w-4" />
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={!isFormValid || isUpdating}
                className="flex items-center gap-2"
              >
                <CheckIcon className="h-4 w-4" />
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-white">
                  Target Tracking
                </label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enable ticket sales target tracking and milestone monitoring
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) =>
                    handleFieldChange('enabled', e.target.checked)
                  }
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 peer-focus:outline-none after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"></div>
              </label>
            </div>

            {formData.enabled && (
              <>
                {/* Ticket Capacity */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                    Ticket Capacity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={formData.capacity}
                    onChange={(e) =>
                      handleFieldChange(
                        'capacity',
                        parseInt(e.target.value) || 0,
                      )
                    }
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-700"
                    placeholder="e.g., 250"
                  />
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    Maximum number of tickets available for sale
                  </p>
                </div>

                {/* Sales Start Date */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                    Sales Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.salesStartDate}
                    onChange={(e) =>
                      handleFieldChange('salesStartDate', e.target.value)
                    }
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-700"
                  />
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    When ticket sales began or will begin
                  </p>
                </div>

                {/* Target Curve */}
                <div>
                  <label className="mb-3 block text-sm font-medium text-gray-900 dark:text-white">
                    Sales Target Curve
                  </label>
                  <CurveSelectionGrid
                    selected={formData.targetCurve}
                    onSelect={(curve) =>
                      handleFieldChange('targetCurve', curve)
                    }
                  />
                  {selectedCurveInfo && (
                    <div className="mt-3 flex items-start gap-2 rounded-md bg-blue-50 p-3 dark:bg-blue-900/20">
                      <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>{selectedCurveInfo.label}:</strong>{' '}
                        {selectedCurveInfo.description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Milestones */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-white">
                        Milestones
                      </label>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Important dates to track during the sales period
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addMilestone}
                      className="flex items-center gap-2"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add Milestone
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {formData.milestones.length === 0 ? (
                      <div className="py-6 text-center text-gray-500 dark:text-gray-400">
                        <p className="text-sm">No milestones configured</p>
                        <p className="mt-1 text-xs">
                          Click &quot;Add Milestone&quot; to create your first
                          milestone
                        </p>
                      </div>
                    ) : (
                      formData.milestones.map((milestone) => (
                        <div
                          key={milestone.id}
                          className="flex items-center gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700"
                        >
                          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                                Date
                              </label>
                              <input
                                type="date"
                                value={milestone.date}
                                onChange={(e) =>
                                  handleMilestoneChange(
                                    milestone.id,
                                    'date',
                                    e.target.value,
                                  )
                                }
                                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-700"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                                Label
                              </label>
                              <input
                                type="text"
                                value={milestone.label}
                                onChange={(e) =>
                                  handleMilestoneChange(
                                    milestone.id,
                                    'label',
                                    e.target.value,
                                  )
                                }
                                placeholder="e.g., Early Bird Ends"
                                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-700"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                                Target %
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={milestone.targetPercentage}
                                onChange={(e) =>
                                  handleMilestoneChange(
                                    milestone.id,
                                    'targetPercentage',
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                placeholder="50"
                                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-700"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => removeMilestone(milestone.id)}
                            className="flex-shrink-0 p-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Current Configuration Summary (when not editing) */}
            {formData.enabled && (
              <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
                <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                  Current Configuration
                </h4>
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Capacity:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                      {formData.capacity} tickets
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Curve:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                      {
                        TARGET_CURVE_OPTIONS.find(
                          (opt) => opt.value === formData.targetCurve,
                        )?.label
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Sales Start:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                      {formData.salesStartDate
                        ? formatDate(formData.salesStartDate)
                        : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Milestones:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                      {formData.milestones.length} configured
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
