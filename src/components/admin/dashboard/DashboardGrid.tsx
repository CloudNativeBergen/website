'use client'

import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  pointerWithin,
  Modifier,
  type Announcements,
  type ScreenReaderInstructions,
} from '@dnd-kit/core'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Widget } from '@/lib/dashboard/types'
import { GRID_CONFIG } from '@/lib/dashboard/constants'
import { computeDropPosition } from '@/lib/dashboard/grid-utils'

const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'To pick up a widget, press space or enter. While dragging, use the arrow keys to move it around the grid. Press space or enter again to drop the widget in its new position, or press escape to cancel.',
}

/**
 * DashboardGrid - The main container for the widget-based dashboard system
 *
 * Features:
 * - Fluid responsive grid (12/6/4 columns based on viewport)
 * - Drag-and-drop with real-time snapping
 * - Collision detection
 * - Visual grid overlay in edit mode
 * - Dynamic cell sizing based on container width
 */
interface DashboardGridProps {
  widgets: Widget[]
  onWidgetsChange: (widgets: Widget[]) => void
  columnCount: number
  editMode: boolean
  children: (
    widget: Widget,
    isDragging: boolean,
    cellWidth: number,
  ) => React.ReactNode
}

export function DashboardGrid({
  widgets,
  onWidgetsChange,
  columnCount,
  editMode,
  children,
}: DashboardGridProps) {
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const gridNodeRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const gridRef = useCallback((node: HTMLDivElement | null) => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    gridNodeRef.current = node

    if (!node) return

    const updateWidth = () => setGridWidth(node.offsetWidth)
    updateWidth()

    observerRef.current = new ResizeObserver(updateWidth)
    observerRef.current.observe(node)
  }, [])

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  const cellWidth = useMemo(() => {
    if (!gridWidth || columnCount === 0) return 96
    return (gridWidth - (columnCount - 1) * GRID_CONFIG.gap) / columnCount
  }, [gridWidth, columnCount])

  const snapModifier: Modifier = useMemo(
    () =>
      ({ transform }) => {
        const cellWithGap = cellWidth + GRID_CONFIG.gap
        const rowWithGap = GRID_CONFIG.cellSize + GRID_CONFIG.gap
        return {
          ...transform,
          x: Math.round(transform.x / cellWithGap) * cellWithGap,
          y: Math.round(transform.y / rowWithGap) * rowWithGap,
        }
      },
    [cellWidth],
  )

  const isMobile = columnCount === 1

  const gridStyle = useMemo(
    () => ({
      display: isMobile ? ('flex' as const) : ('grid' as const),
      flexDirection: isMobile ? ('column' as const) : undefined,
      gridTemplateColumns: isMobile ? undefined : `repeat(${columnCount}, 1fr)`,
      gridAutoRows: isMobile ? undefined : `${GRID_CONFIG.cellSize}px`,
      gap: `${GRID_CONFIG.gap}px`,
      position: 'relative' as const,
      width: '100%',
    }),
    [columnCount, isMobile],
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveWidgetId(String(event.active.id))
  }, [])

  // Where the last drag actually dropped, for the screen-reader announcement
  // (the announcement callback has no access to the drop computation result).
  const lastDropRef = useRef<{ id: string; row: number; col: number } | null>(
    null,
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event
      const widgetId = String(active.id)
      const widget = widgets.find((w) => w.id === widgetId)

      if (!widget) {
        setActiveWidgetId(null)
        return
      }

      const newPosition = computeDropPosition(
        widget,
        delta,
        cellWidth,
        widgets,
        columnCount,
      )

      if (newPosition) {
        lastDropRef.current = {
          id: widgetId,
          row: newPosition.row,
          col: newPosition.col,
        }
        onWidgetsChange(
          widgets.map((w) =>
            w.id === widgetId ? { ...w, position: newPosition } : w,
          ),
        )
      } else {
        lastDropRef.current = null
      }

      setActiveWidgetId(null)
    },
    [widgets, onWidgetsChange, columnCount, cellWidth],
  )

  // Announce drag lifecycle in grid coordinates (1-based rows/columns) —
  // pixel deltas mean nothing to screen-reader users.
  const announcements = useMemo<Announcements>(() => {
    const find = (id: string | number) =>
      widgets.find((w) => w.id === String(id))
    const at = (row: number, col: number) => `row ${row + 1}, column ${col + 1}`

    return {
      onDragStart({ active }) {
        const w = find(active.id)
        if (!w) return
        return `Picked up ${w.title} widget at ${at(w.position.row, w.position.col)}.`
      },
      onDragOver() {
        return undefined
      },
      onDragEnd({ active }) {
        const w = find(active.id)
        if (!w) return
        const drop = lastDropRef.current
        if (drop && drop.id === String(active.id)) {
          return `${w.title} widget moved to ${at(drop.row, drop.col)}.`
        }
        return `${w.title} widget returned to ${at(w.position.row, w.position.col)}.`
      },
      onDragCancel({ active }) {
        const w = find(active.id)
        if (!w) return
        return `Drag cancelled. ${w.title} widget returned to ${at(w.position.row, w.position.col)}.`
      },
    }
  }, [widgets])

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={pointerWithin}
      modifiers={[snapModifier]}
      accessibility={{
        announcements,
        screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
      }}
    >
      <div className="relative">
        <div ref={gridRef} style={gridStyle} className="min-h-screen">
          {widgets.map((widget) =>
            children(widget, widget.id === activeWidgetId, cellWidth),
          )}
        </div>

        {editMode && (
          <svg
            className="pointer-events-none absolute inset-0"
            style={{
              width: '100%',
              height: '100%',
            }}
          >
            <defs>
              <pattern
                id="grid"
                width={`${100 / columnCount}%`}
                height={GRID_CONFIG.cellSize + GRID_CONFIG.gap}
                patternUnits="userSpaceOnUse"
              >
                <rect
                  width="100%"
                  height={GRID_CONFIG.cellSize}
                  fill="none"
                  stroke="rgba(59, 130, 246, 0.2)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        )}
      </div>
    </DndContext>
  )
}
