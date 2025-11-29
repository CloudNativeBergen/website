import { GridConfig } from './types'

export const GRID_CONFIG: GridConfig = {
  cellSize: 80,
  gap: 16,
  breakpoints: {
    desktop: { minWidth: 1024, cols: 12 },
    tablet: { minWidth: 768, cols: 6 },
    mobile: { minWidth: 0, cols: 4 },
  },
}

export const MOBILE_BREAKPOINT = 768
export const TABLET_BREAKPOINT = 1024
