/**
 * Dashboard Grid System - Public API
 *
 * Import everything you need from this single entry point:
 * ```
 * import { Widget, GRID_CONFIG, checkCollision } from '@/lib/dashboard'
 * ```
 */

// Types
export type { Widget, GridPosition, GridConfig, ConferenceWithSpeakerData } from './types'

// Constants
export { GRID_CONFIG, MOBILE_BREAKPOINT, TABLET_BREAKPOINT } from './constants'

// Utilities
export {
  buildOccupationMap,
  getCellsForPosition,
  checkCollision,
  isValidPosition,
  snapToGrid,
  getColumnCountForWidth,
} from './grid-utils'
