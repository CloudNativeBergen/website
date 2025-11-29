import { GridConfig } from './types'

export const GRID_CONFIG: GridConfig = {
  cellSize: 96,
  gap: 16,
  breakpoints: {
    desktop: { minWidth: 1024, cols: 12 },
    tablet: { minWidth: 768, cols: 6 },
    mobile: { minWidth: 0, cols: 4 },
  },
}
