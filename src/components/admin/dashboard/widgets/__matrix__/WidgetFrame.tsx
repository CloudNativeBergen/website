/**
 * Story-side replica of the REAL WidgetContainer box contract
 * (src/components/admin/dashboard/WidgetContainer.tsx:262-345), so matrix
 * stories exercise widgets inside the exact geometry the dashboard gives them:
 *
 * - Desktop cell: fixed box of `colSpan x rowSpan` grid cells
 *   (width = colSpan*CELL_W + (colSpan-1)*gap, height = rowSpan*96 + (rowSpan-1)*16),
 *   `border-2 rounded-lg overflow-hidden`, inner `h-full p-2`, and
 *   `container-type: size` + `contain: layout style paint` — identical to the
 *   grid path, so the widgets' @container queries respond to the cell.
 * - Mobile: single-column behaviour (columnCount === 1) — auto height, NO
 *   container-type (container queries fall back to the viewport), 361px wide
 *   (393px iPhone-portrait viewport minus 2x16px page padding).
 * - Edit chrome: the macOS-dots overlay plus the `[&_h3:first-of-type]:ml-20`
 *   header-indent hack, so dot/header overlap cells are inspectable.
 *
 * CELL_W = 92px: a 1280px desktop grid with 12 columns and 16px gaps gives
 * (1280 - 11*16) / 12 = 92px per column — the representative desktop cell.
 */

import { CogIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { GRID_CONFIG } from '@/lib/dashboard/constants'
import { getWidgetMetadata } from '@/lib/dashboard/widget-registry'

export const DESKTOP_CELL_WIDTH = 92
export const MOBILE_FRAME_WIDTH = 361

interface WidgetFrameProps {
  /** Columns spanned (desktop mode). */
  colSpan?: number
  /** Rows spanned (desktop mode). */
  rowSpan?: number
  /** 'desktop' = fixed cell + size containment; 'mobile' = auto-height column. */
  mode?: 'desktop' | 'mobile'
  /** Replicate edit-mode chrome (mac dots + header indent + resize handle). */
  editMode?: boolean
  /** Show the green config dot too (widgets with a configSchema). */
  showConfigDot?: boolean
  /** Caption rendered under the frame. */
  label?: string
  children: React.ReactNode
}

export function WidgetFrame({
  colSpan = 3,
  rowSpan = 3,
  mode = 'desktop',
  editMode = false,
  showConfigDot = false,
  label,
  children,
}: WidgetFrameProps) {
  const isMobile = mode === 'mobile'
  const width = isMobile
    ? MOBILE_FRAME_WIDTH
    : colSpan * DESKTOP_CELL_WIDTH + (colSpan - 1) * GRID_CONFIG.gap
  const height = isMobile
    ? undefined
    : rowSpan * GRID_CONFIG.cellSize + (rowSpan - 1) * GRID_CONFIG.gap

  return (
    <figure className="m-0 shrink-0" style={{ width }}>
      <div
        style={{
          width,
          height,
          containerType: isMobile ? undefined : ('size' as const),
          contain: isMobile ? undefined : 'layout style paint',
        }}
        className="relative overflow-hidden rounded-lg border-2 border-gray-200 bg-white shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800"
      >
        {editMode && (
          <div className="absolute top-0 left-0 z-10 flex">
            <span className="flex h-11 w-11 items-center justify-center">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 shadow-sm dark:bg-red-600">
                <XMarkIcon className="h-2.5 w-2.5 stroke-[2.5] text-red-950" />
              </span>
            </span>
            {showConfigDot && (
              <span className="flex h-11 w-11 items-center justify-center">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500 shadow-sm dark:bg-green-600">
                  <CogIcon className="h-2.5 w-2.5 stroke-[2.5] text-green-950" />
                </span>
              </span>
            )}
          </div>
        )}

        <div
          className={`h-full p-2 ${
            editMode
              ? 'pointer-events-none select-none [&_h3:first-of-type]:ml-20'
              : ''
          }`}
        >
          {children}
        </div>

        {editMode && !isMobile && (
          <div
            className="pointer-events-none absolute right-0 bottom-0 h-6 w-6"
            style={{
              background:
                'linear-gradient(135deg, transparent 0%, transparent 50%, rgb(59, 130, 246) 50%, rgb(59, 130, 246) 100%)',
            }}
          />
        )}
      </div>
      {label && (
        <figcaption className="mt-1.5 font-mono text-[10px] text-gray-500 dark:text-gray-400">
          {label}
          {!isMobile && ` · ${colSpan}×${rowSpan}`}
          {isMobile && ' · mobile auto-height'}
        </figcaption>
      )}
    </figure>
  )
}

/** Flow layout for a set of frames within one story. */
export function MatrixGrid({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start gap-6">{children}</div>
}

export interface MatrixSize {
  name: string
  colSpan: number
  rowSpan: number
}

/**
 * The size axis for a widget, derived FROM THE REGISTRY so stories cannot
 * drift from it: true minimum (constraints.minCols x minRows), the default
 * preset, every available preset, and the true maximum
 * (constraints.maxCols x maxRows). Deduplicated by dimensions (labels merged).
 */
export function matrixSizesFor(type: string): MatrixSize[] {
  const meta = getWidgetMetadata(type)
  if (!meta) {
    throw new Error(`[matrix] unknown widget type "${type}"`)
  }
  const { constraints, defaultSize, availableSizes } = meta
  const raw: MatrixSize[] = [
    {
      name: 'min',
      colSpan: constraints.minCols,
      rowSpan: constraints.minRows,
    },
    {
      name: `default/${defaultSize.name}`,
      colSpan: defaultSize.colSpan,
      rowSpan: defaultSize.rowSpan,
    },
    ...availableSizes.map((s) => ({
      name: s.name,
      colSpan: s.colSpan,
      rowSpan: s.rowSpan,
    })),
    {
      name: 'max',
      colSpan: constraints.maxCols,
      rowSpan: constraints.maxRows,
    },
  ]
  const byDims = new Map<string, MatrixSize>()
  for (const size of raw) {
    const key = `${size.colSpan}x${size.rowSpan}`
    const existing = byDims.get(key)
    if (existing) {
      existing.name = `${existing.name}=${size.name}`
    } else {
      byDims.set(key, { ...size })
    }
  }
  return [...byDims.values()]
}

/** The registry defaultSize for a widget (throws on unknown type). */
export function defaultSizeFor(type: string): MatrixSize {
  const meta = getWidgetMetadata(type)
  if (!meta) {
    throw new Error(`[matrix] unknown widget type "${type}"`)
  }
  return {
    name: `default/${meta.defaultSize.name}`,
    colSpan: meta.defaultSize.colSpan,
    rowSpan: meta.defaultSize.rowSpan,
  }
}
