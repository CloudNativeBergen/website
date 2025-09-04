import type { TicketTargetAnalysis, TargetVsActualData } from './targets'

/**
 * Chart series data structure for ApexCharts
 */
interface ChartSeries {
  name: string
  type: 'column' | 'line'
  data: Array<{ x: string; y: number }>
  color?: string
  yAxisIndex?: number
}

/**
 * Debug information for chart data processing
 */
interface ChartDebugInfo {
  totalCategories: number
  categoriesList: string[]
  dataPointsCount: number
  maxActualValue: number
  maxTargetValue: number
}

/**
 * Processed chart data ready for visualization
 */
interface ChartData {
  series: ChartSeries[]
  combinedData: TargetVsActualData[]
  debugInfo: ChartDebugInfo
}

/**
 * Color palette for different ticket categories - optimized for accessibility and dark mode
 */
const CATEGORY_COLORS = [
  '#3B82F6', // blue-500 - Primary color
  '#10B981', // emerald-500 - Success
  '#F59E0B', // amber-500 - Warning
  '#EF4444', // red-500 - Error
  '#8B5CF6', // violet-500 - Creative
  '#06B6D4', // cyan-500 - Info
  '#F97316', // orange-500 - Energy
  '#84CC16', // lime-500 - Nature
  '#EC4899', // pink-500 - Accent
  '#6366F1', // indigo-500 - Deep
] as const

/**
 * Target line configuration
 */
const TARGET_LINE_CONFIG = {
  color: '#FDE047', // yellow-300 - bright and visible in dark mode
  name: 'Sales Target',
  type: 'line' as const,
} as const

/**
 * Validates the input analysis data
 * @param analysis - Ticket target analysis data
 * @throws Error if data is invalid
 */
function validateAnalysisData(analysis: TicketTargetAnalysis): void {
  if (!analysis) {
    throw new Error('Analysis data is required')
  }

  if (!analysis.combinedData || !Array.isArray(analysis.combinedData)) {
    throw new Error('Combined data must be an array')
  }

  if (analysis.combinedData.length === 0) {
    throw new Error('Combined data cannot be empty')
  }
}

/**
 * Extracts unique categories from the combined data
 * @param combinedData - Array of target vs actual data points
 * @returns Sorted array of unique category names
 */
function extractUniqueCategories(combinedData: TargetVsActualData[]): string[] {
  const categories = new Set<string>()

  for (const point of combinedData) {
    if (point.categories && typeof point.categories === 'object') {
      for (const category in point.categories) {
        if (Object.prototype.hasOwnProperty.call(point.categories, category)) {
          categories.add(category)
        }
      }
    }
  }

  return Array.from(categories).sort()
}

/**
 * Creates chart series for ticket categories
 * @param categoriesList - Array of category names
 * @param combinedData - Array of target vs actual data points
 * @returns Array of chart series for categories
 */
function createCategorySeries(
  categoriesList: string[],
  combinedData: TargetVsActualData[],
): ChartSeries[] {
  return categoriesList.map((category, index) => ({
    name: category,
    type: 'column' as const,
    data: combinedData.map((point) => ({
      x: point.date,
      y: point.categories[category] || 0,
    })),
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }))
}

/**
 * Creates the target line series
 * @param combinedData - Array of target vs actual data points
 * @returns Target line chart series
 */
function createTargetSeries(combinedData: TargetVsActualData[]): ChartSeries {
  return {
    name: TARGET_LINE_CONFIG.name,
    type: TARGET_LINE_CONFIG.type,
    data: combinedData.map((point) => ({
      x: point.date,
      y: point.target,
    })),
    color: TARGET_LINE_CONFIG.color,
  }
}

/**
 * Calculates debug information for the chart
 * @param categoriesList - Array of category names
 * @param combinedData - Array of target vs actual data points
 * @returns Debug information object
 */
function calculateDebugInfo(
  categoriesList: string[],
  combinedData: TargetVsActualData[],
): ChartDebugInfo {
  const maxActualValue = Math.max(...combinedData.map((d) => d.actual), 0)
  const maxTargetValue = Math.max(...combinedData.map((d) => d.target), 0)

  return {
    totalCategories: categoriesList.length,
    categoriesList,
    dataPointsCount: combinedData.length,
    maxActualValue,
    maxTargetValue,
  }
}

/**
 * Process ticket target analysis data for chart visualization
 * Creates series for each ticket category plus target line
 *
 * @param analysis - Ticket target analysis containing combined data
 * @returns Processed chart data with series, combined data, and debug info
 * @throws Error if input data is invalid
 */
export function processChartData(analysis: TicketTargetAnalysis): ChartData {
  try {
    // Validate input data
    validateAnalysisData(analysis)

    const { combinedData } = analysis

    // Extract unique categories from the data
    const categoriesList = extractUniqueCategories(combinedData)

    // Create chart series for each ticket category (stacked columns)
    const categorySeries = createCategorySeries(categoriesList, combinedData)

    // Create target line series
    const targetSeries = createTargetSeries(combinedData)

    // Combine all series
    const allSeries = [...categorySeries, targetSeries]

    // Calculate debug information
    const debugInfo = calculateDebugInfo(categoriesList, combinedData)

    return {
      series: allSeries,
      combinedData,
      debugInfo,
    }
  } catch {
    // Return empty but valid data structure on error
    const emptyDebugInfo: ChartDebugInfo = {
      totalCategories: 0,
      categoriesList: [],
      dataPointsCount: 0,
      maxActualValue: 0,
      maxTargetValue: 0,
    }

    return {
      series: [],
      combinedData: [],
      debugInfo: emptyDebugInfo,
    }
  }
}
