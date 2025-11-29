'use client'

import { useDraggable } from '@dnd-kit/core'
import { useState, useCallback, useRef, useEffect } from 'react'
import { Widget, GridPosition } from '@/lib/dashboard/types'
import { GRID_CONFIG } from '@/lib/dashboard/constants'
import { checkCollision } from '@/lib/dashboard/grid-utils'

/**
 * WidgetContainer - Wrapper for individual dashboard widgets
 *
 * Features:
 * - Entire widget is draggable for repositioning
 * - Resize handle (bottom-right corner)
 * - Real-time collision detection during resize
 * - Visual feedback for collisions (red border)
 * - Respects grid boundaries
 */
interface WidgetContainerProps {
  widget: Widget
  editMode: boolean
  isDragging: boolean
  columnCount: number
  cellWidth: number
  allWidgets: Widget[]
  onResize: (widgetId: string, newPosition: GridPosition) => void
  children: React.ReactNode
}

export function WidgetContainer({
  widget,
  editMode,
  isDragging,
  columnCount,
  cellWidth,
  allWidgets,
  onResize,
  children,
}: WidgetContainerProps) {
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; position: GridPosition } | null>(null)
  const [previewPosition, setPreviewPosition] = useState<GridPosition | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: widget.id,
    disabled: !editMode || isResizing,
  })

  const currentPosition = previewPosition || widget.position
  const hasCollision = previewPosition
    ? checkCollision(previewPosition, allWidgets, widget.id, columnCount)
    : false

  const style = {
    gridColumn: columnCount === 1
      ? '1 / -1'
      : `${currentPosition.col + 1} / span ${currentPosition.colSpan}`,
    gridRow: `${currentPosition.row + 1} / span ${currentPosition.rowSpan}`,
    transform: transform && !isResizing
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  }

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      if (!editMode) return
      e.preventDefault()
      e.stopPropagation()

      setIsResizing(true)
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        position: widget.position,
      })

      const target = e.target as HTMLElement
      target.setPointerCapture(e.pointerId)
    },
    [editMode, widget.position],
  )

  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      if (!isResizing || !resizeStart) return

      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y

      const cellWithGap = cellWidth + GRID_CONFIG.gap

      const colSpanDelta = Math.floor(deltaX / cellWithGap + 0.5)
      const rowSpanDelta = Math.floor(deltaY / cellWithGap + 0.5)

      const newColSpan = Math.max(1, Math.min(columnCount - resizeStart.position.col, resizeStart.position.colSpan + colSpanDelta))
      const newRowSpan = Math.max(1, resizeStart.position.rowSpan + rowSpanDelta)

      const newPosition: GridPosition = {
        ...resizeStart.position,
        colSpan: newColSpan,
        rowSpan: newRowSpan,
      }

      setPreviewPosition(newPosition)
    },
    [isResizing, resizeStart],
  )

  const handleResizeEnd = useCallback(
    (e: PointerEvent) => {
      if (!isResizing || !previewPosition) {
        setIsResizing(false)
        setResizeStart(null)
        setPreviewPosition(null)
        return
      }

      const hasCollision = checkCollision(
        previewPosition,
        allWidgets,
        widget.id,
        columnCount,
      )

      if (!hasCollision) {
        onResize(widget.id, previewPosition)
      }

      setIsResizing(false)
      setResizeStart(null)
      setPreviewPosition(null)

      const target = e.target as HTMLElement
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId)
      }
    },
    [isResizing, previewPosition, allWidgets, widget.id, columnCount, onResize],
  )

  useEffect(() => {
    if (!isResizing) return

    window.addEventListener('pointermove', handleResizeMove)
    window.addEventListener('pointerup', handleResizeEnd)

    return () => {
      window.removeEventListener('pointermove', handleResizeMove)
      window.removeEventListener('pointerup', handleResizeEnd)
    }
  }, [isResizing, handleResizeMove, handleResizeEnd])

  const borderColor = hasCollision
    ? 'border-red-500 dark:border-red-400'
    : isDragging || isResizing
      ? 'border-blue-500 dark:border-blue-400'
      : 'border-gray-200 dark:border-gray-700'

  return (
    <div
      key={widget.id}
      ref={(node) => {
        setNodeRef(node)
        if (containerRef.current !== node) {
          containerRef.current = node
        }
      }}
      {...attributes}
      {...listeners}
      style={{
        ...style,
        cursor: editMode && !isResizing ? 'grab' : undefined,
        touchAction: 'none',
      }}
      className={`relative rounded-lg border-2 bg-white shadow-sm transition-colors dark:bg-gray-800 ${borderColor}`}
    >
      <div className="h-full p-3 select-none pointer-events-none">{children}</div>

      {editMode && (
        <div
          onPointerDown={handleResizeStart}
          className="absolute bottom-0 right-0 h-6 w-6 cursor-nwse-resize pointer-events-auto"
          style={{
            touchAction: 'none',
            background:
              'linear-gradient(135deg, transparent 0%, transparent 50%, rgb(59, 130, 246) 50%, rgb(59, 130, 246) 100%)',
          }}
        />
      )}
    </div>
  )
}
