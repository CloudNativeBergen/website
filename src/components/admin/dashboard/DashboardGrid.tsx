'use client'

import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  pointerWithin,
  Modifier,
} from '@dnd-kit/core'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Widget } from '@/lib/dashboard/types'
import { GRID_CONFIG } from '@/lib/dashboard/constants'
import { checkCollision, snapToGrid } from '@/lib/dashboard/grid-utils'

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

  const gridStyle = useMemo(
    () => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
      gridAutoRows: `${GRID_CONFIG.cellSize}px`,
      gap: `${GRID_CONFIG.gap}px`,
      position: 'relative' as const,
      width: '100%',
    }),
    [columnCount],
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveWidgetId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event
      const widgetId = active.id as string
      const widget = widgets.find((w) => w.id === widgetId)

      if (!widget) {
        setActiveWidgetId(null)
        return
      }

      const currentPosition = widget.position
      const cellWithGap = cellWidth + GRID_CONFIG.gap
      const rowWithGap = GRID_CONFIG.cellSize + GRID_CONFIG.gap

      const snapped = snapToGrid(
        currentPosition.col * cellWithGap + delta.x,
        currentPosition.row * rowWithGap + delta.y,
        cellWidth,
        GRID_CONFIG.cellSize,
        GRID_CONFIG.gap,
        columnCount,
      )

      const newPosition = {
        ...currentPosition,
        row: snapped.row,
        col: snapped.col,
      }

      const hasCollision = checkCollision(
        newPosition,
        widgets,
        widgetId,
        columnCount,
      )

      if (!hasCollision) {
        const updatedWidgets = widgets.map((w) =>
          w.id === widgetId ? { ...w, position: newPosition } : w,
        )
        onWidgetsChange(updatedWidgets)
      }

      setActiveWidgetId(null)
    },
    [widgets, onWidgetsChange, columnCount, cellWidth],
  )

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={pointerWithin}
      modifiers={[snapModifier]}
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
