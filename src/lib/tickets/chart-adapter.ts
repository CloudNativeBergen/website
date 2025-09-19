import type {
  TicketAnalysisResult,
  ChartData,
  ChartSeries,
  CombinedDataPoint,
  ChartAnnotation,
  SalesTargetConfig,
} from './types'

const CATEGORY_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#F97316',
  '#84CC16',
  '#EC4899',
  '#6366F1',
] as const

const TARGET_LINE_COLOR = '#FDE047'

export function adaptForChart(
  analysis: TicketAnalysisResult,
  additionalAnnotations: ChartAnnotation[] = [],
): ChartData {
  const categories = extractCategories(analysis.progression)
  const maxValue = analysis.capacity

  const categorySeries = createCategorySeries(categories, analysis.progression)
  const targetSeries = createTargetSeries(analysis.progression)
  const baseAnnotations = createAnnotations(analysis)
  const allAnnotations = [...baseAnnotations, ...additionalAnnotations]

  return {
    series: [...categorySeries, targetSeries],
    maxValue,
    categories,
    annotations: allAnnotations,
  }
}

function extractCategories(progression: CombinedDataPoint[]): string[] {
  const categorySet = new Set<string>()

  progression.forEach((point) => {
    Object.keys(point.categoryBreakdown).forEach((category) => {
      categorySet.add(category)
    })
  })

  return Array.from(categorySet).sort()
}

function createCategorySeries(
  categories: string[],
  progression: CombinedDataPoint[],
): ChartSeries[] {
  return categories.map((category, index) => ({
    name: category,
    type: 'column' as const,
    data: progression.map((point) => ({
      x: point.date,
      y: point.categoryBreakdown[category] || 0,
    })),
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }))
}

function createTargetSeries(progression: CombinedDataPoint[]): ChartSeries {
  return {
    name: 'Sales Target',
    type: 'line' as const,
    data: progression.map((point) => ({
      x: point.date,
      y: point.targetTickets,
    })),
    color: TARGET_LINE_COLOR,
  }
}

function createAnnotations(analysis: TicketAnalysisResult): ChartAnnotation[] {
  const annotations: ChartAnnotation[] = []

  // Add "Today" marker
  annotations.push({
    id: 'today',
    type: 'xaxis',
    value: new Date().getTime(),
    label: 'Today',
    color: '#6B7280',
    strokeDashArray: 3,
    position: 'top',
  })

  // Add milestone annotations
  analysis.progression
    .filter((point) => point.isMilestone && point.milestoneLabel)
    .forEach((milestone, index) => {
      annotations.push({
        id: `milestone-${index}`,
        type: 'xaxis',
        value: new Date(milestone.date).getTime(),
        label: milestone.milestoneLabel!,
        color: '#EF4444',
        strokeDashArray: 5,
        position: 'top',
      })
    })

  return annotations
}

export function createConfigAnnotations(
  config: SalesTargetConfig,
): ChartAnnotation[] {
  const annotations: ChartAnnotation[] = []

  if (config.sales_start_date) {
    annotations.push({
      id: 'sales-start',
      type: 'xaxis',
      value: new Date(config.sales_start_date).getTime(),
      label: 'Sales Started',
      color: '#10B981',
      strokeDashArray: 4,
      position: 'top',
    })
  }

  return annotations
}

function convertAnnotationsToApexFormat(annotations: ChartAnnotation[]) {
  const xaxisAnnotations = annotations
    .filter((annotation) => annotation.type === 'xaxis')
    .map((annotation) => ({
      x: annotation.value,
      borderColor: annotation.color || '#6B7280',
      borderWidth: 1,
      strokeDashArray: annotation.strokeDashArray || 3,
      label: {
        style: {
          color: annotation.color || '#6B7280',
          background: '#F9FAFB',
          fontSize: '10px',
        },
        text: annotation.label || '',
        position: annotation.position || 'top',
      },
    }))

  const yaxisAnnotations = annotations
    .filter((annotation) => annotation.type === 'yaxis')
    .map((annotation) => ({
      y: annotation.value,
      borderColor: annotation.color || '#6B7280',
      borderWidth: 2,
      strokeDashArray: annotation.strokeDashArray || 5,
      label: {
        style: {
          color: annotation.color || '#6B7280',
          background: '#F9FAFB',
          fontSize: '10px',
        },
        text: annotation.label || '',
        position: annotation.position || 'left',
      },
    }))

  const pointAnnotations = annotations
    .filter((annotation) => annotation.type === 'point')
    .map((annotation) => ({
      x: annotation.value,
      y: 0, // You might want to calculate a proper y value
      marker: {
        size: 6,
        fillColor: annotation.color || '#6B7280',
        strokeColor: '#FFF',
        strokeWidth: 2,
      },
      label: {
        text: annotation.label || '',
        style: {
          color: annotation.color || '#6B7280',
          background: '#F9FAFB',
          fontSize: '10px',
        },
      },
    }))

  return {
    xaxis: xaxisAnnotations,
    yaxis: yaxisAnnotations,
    points: pointAnnotations,
  }
}

export { convertAnnotationsToApexFormat }

export function createTooltipContent(
  point: CombinedDataPoint,
  actualTicketCount: number,
  revenue: number,
): string {
  const date = new Date(point.date)
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const badges: string[] = []
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  const isFuture = date > today

  if (isToday) {
    badges.push(
      '<span class="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Today</span>',
    )
  }
  if (isFuture) {
    badges.push(
      '<span class="ml-2 text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">Future</span>',
    )
  }
  if (point.isMilestone && point.milestoneLabel) {
    badges.push(
      `<span class="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">${point.milestoneLabel}</span>`,
    )
  }

  const categoryHTML = Object.entries(point.categoryBreakdown)
    .filter(([, count]) => count > 0)
    .map(
      ([category, count]) =>
        `<div class="flex justify-between items-center py-1">
        <span class="text-sm text-gray-600 dark:text-gray-400">${category}:</span>
        <span class="font-medium text-gray-900 dark:text-white">${count}</span>
      </div>`,
    )
    .join('')

  const avgPriceHTML =
    actualTicketCount > 0
      ? `<div class="flex justify-between items-center">
        <span class="text-sm text-gray-600 dark:text-gray-400">Avg. Price:</span>
        <span class="text-sm text-gray-700 dark:text-gray-300">$${(revenue / actualTicketCount).toFixed(0)}</span>
      </div>`
      : ''

  return `
    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 min-w-[280px]">
      <div class="font-semibold text-gray-900 dark:text-white mb-3 text-center">
        ${formattedDate}
        ${badges.join('')}
      </div>
      ${categoryHTML ? `<div class="mb-3">${categoryHTML}</div>` : ''}
      <div class="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3 space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Total Sold:</span>
          <span class="font-semibold text-gray-900 dark:text-white">${actualTicketCount}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-600 dark:text-gray-400">Target:</span>
          <span class="font-medium ${actualTicketCount >= point.targetTickets ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">${point.targetTickets}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-600 dark:text-gray-400">Revenue:</span>
          <span class="font-medium text-green-600 dark:text-green-400">$${revenue.toLocaleString()}</span>
        </div>
        ${avgPriceHTML}
      </div>
    </div>
  `
}
