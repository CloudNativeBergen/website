'use client'

import { useDraggable } from '@dnd-kit/core'
import { useState, useCallback, useRef, useEffect } from 'react'
import { Widget, GridPosition } from '@/lib/dashboard/types'
import { GRID_CONFIG } from '@/lib/dashboard/constants'
import { checkCollision } from '@/lib/dashboard/grid-utils'
import { getWidgetMetadata } from '@/lib/dashboard/widget-registry'
import { CogIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { WidgetConfigModal } from './WidgetConfigModal'

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
  onRemove?: (widgetId: string) => void
  onConfigChange?: (widgetId: string, config: Record<string, unknown>) => void
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
  onRemove,
  onConfigChange,
  children,
}: WidgetContainerProps) {
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState<{
    x: number
    y: number
    position: GridPosition
  } | null>(null)
  const [previewPosition, setPreviewPosition] = useState<GridPosition | null>(
    null,
  )
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const metadata = getWidgetMetadata(widget.type)

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: widget.id,
    disabled: !editMode || isResizing,
  })

  const currentPosition = previewPosition || widget.position
  const hasCollision = previewPosition
    ? checkCollision(previewPosition, allWidgets, widget.id, columnCount)
    : false

  const style = {
    gridColumn:
      columnCount === 1
        ? '1 / -1'
        : `${currentPosition.col + 1} / span ${currentPosition.colSpan}`,
    gridRow: `${currentPosition.row + 1} / span ${currentPosition.rowSpan}`,
    transform:
      transform && !isResizing
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
      const rowWithGap = GRID_CONFIG.cellSize + GRID_CONFIG.gap

      const colSpanDelta = Math.floor(deltaX / cellWithGap + 0.5)
      const rowSpanDelta = Math.floor(deltaY / rowWithGap + 0.5)

      // Get widget constraints from metadata
      const constraints = metadata?.constraints

      // Calculate new dimensions with constraints
      let newColSpan = resizeStart.position.colSpan + colSpanDelta
      let newRowSpan = resizeStart.position.rowSpan + rowSpanDelta

      // Apply min/max constraints if available
      if (constraints) {
        newColSpan = Math.max(
          constraints.minCols,
          Math.min(constraints.maxCols, newColSpan),
        )
        newRowSpan = Math.max(
          constraints.minRows,
          Math.min(constraints.maxRows, newRowSpan),
        )
      } else {
        // Fallback to basic constraints
        newColSpan = Math.max(1, newColSpan)
        newRowSpan = Math.max(1, newRowSpan)
      }

      // Ensure doesn't exceed grid boundaries
      newColSpan = Math.min(columnCount - resizeStart.position.col, newColSpan)

      const newPosition: GridPosition = {
        ...resizeStart.position,
        colSpan: newColSpan,
        rowSpan: newRowSpan,
      }

      setPreviewPosition(newPosition)
    },
    [
      isResizing,
      resizeStart,
      cellWidth,
      columnCount,
      metadata?.constraints,
      setPreviewPosition,
    ],
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

  const hasConfigSchema = Boolean(metadata?.configSchema)

  const handleConfigClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsConfigModalOpen(true)
  }

  const handleConfigSave = (config: Record<string, unknown>) => {
    if (onConfigChange) {
      onConfigChange(widget.id, config)
    }
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onRemove) {
      onRemove(widget.id)
    }
  }

  return (
    <>
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
          containerType: 'size',
          // CSS containment for performance - isolate widgets from affecting each other
          contain: 'layout style paint',
        }}
        className={`relative rounded-lg border-2 bg-white shadow-sm transition-colors dark:bg-gray-800 ${borderColor}`}
      >
        {/* macOS-style window controls */}
        {editMode && (
          <div className="absolute top-2 left-2 z-10 flex gap-1.5">
            {/* Close/Remove button - red */}
            <button
              onPointerDown={(e) => {
                e.stopPropagation()
              }}
              onClick={handleRemove}
              className="group pointer-events-auto flex h-3 w-3 items-center justify-center rounded-full bg-red-500 shadow-sm transition-all hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
              title="Remove widget"
              type="button"
            >
              <XMarkIcon className="h-2.5 w-2.5 stroke-[2.5] text-red-950 opacity-0 transition-opacity group-hover:opacity-80 dark:text-red-950" />
            </button>

            {/* Config button - green (only show if widget has config schema) */}
            {hasConfigSchema && (
              <button
                onPointerDown={(e) => {
                  e.stopPropagation()
                }}
                onClick={handleConfigClick}
                className="group pointer-events-auto flex h-3 w-3 items-center justify-center rounded-full bg-green-500 shadow-sm transition-all hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
                title="Configure widget"
                type="button"
              >
                <CogIcon className="h-2.5 w-2.5 stroke-[2.5] text-green-950 opacity-0 transition-opacity group-hover:opacity-80 dark:text-green-950" />
              </button>
            )}
          </div>
        )}

        {/* @supports not (container-type: size) fallback handled via CSS cascade */}
        <div
          className={`h-full p-2 ${editMode ? 'pointer-events-none select-none [&_h3:first-of-type]:ml-10' : ''}`}
        >
          {children}
        </div>

        {editMode && (
          <div
            onPointerDown={handleResizeStart}
            className="pointer-events-auto absolute right-0 bottom-0 h-6 w-6 cursor-nwse-resize"
            style={{
              touchAction: 'none',
              background:
                'linear-gradient(135deg, transparent 0%, transparent 50%, rgb(59, 130, 246) 50%, rgb(59, 130, 246) 100%)',
            }}
          />
        )}
      </div>

      {/* Config Modal */}
      <WidgetConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        widgetType={widget.type}
        widgetDisplayName={metadata?.displayName || widget.type}
        currentConfig={widget.config}
        onSave={handleConfigSave}
      />
    </>
  )
}
