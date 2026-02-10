import { GridConfig } from './types'

export const GRID_CONFIG: GridConfig = {
  cellSize: 96,
  gap: 16,
  breakpoints: {
    desktop: { minWidth: 1024, cols: 12 },
    tablet: { minWidth: 768, cols: 6 },
    mobile: { minWidth: 0, cols: 1 },
  },
}

export const DASHBOARD_SAVE_DEBOUNCE_MS = 1500
export const SWIPE_THRESHOLD_PX = 50
export const SWIPE_ANIMATION_MS = 300
export const MIN_GRID_ROWS = 10
