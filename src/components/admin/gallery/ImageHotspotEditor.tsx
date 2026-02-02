'use client'

import { useState, useRef, useCallback } from 'react'

interface Hotspot {
  x: number
  y: number
  width: number
  height: number
}

interface ImageHotspotEditorProps {
  imageUrl: string
  imageAlt?: string
  hotspot: Hotspot | null
  onChange: (hotspot: Hotspot | null) => void
  className?: string
}

/**
 * Bounding box hotspot editor with Cloud Native Days Norway branding.
 * Drag to create a rectangular area that defines the focal region.
 * The selected area will be preserved when images are cropped.
 */
export function ImageHotspotEditor({
  imageUrl,
  imageAlt,
  hotspot: externalHotspot,
  onChange,
  className = '',
}: ImageHotspotEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [moveStart, setMoveStart] = useState<{
    x: number
    y: number
    hotspotX: number
    hotspotY: number
  } | null>(null)
  const [resizeStart, setResizeStart] = useState<{
    x: number
    y: number
    hotspot: Hotspot
  } | null>(null)
  const [localHotspot, setLocalHotspot] = useState<Hotspot>(
    externalHotspot || { x: 0.5, y: 0.5, width: 0.3, height: 0.3 },
  )

  const hotspot = externalHotspot || localHotspot

  const getRelativeCoordinates = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const container = containerRef.current
      if (!container) return null

      const rect = container.getBoundingClientRect()
      const x = (clientX - rect.left) / rect.width
      const y = (clientY - rect.top) / rect.height

      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      }
    },
    [],
  )

  const createBoundingBox = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
    ): Hotspot => {
      const left = Math.min(start.x, end.x)
      const right = Math.max(start.x, end.x)
      const top = Math.min(start.y, end.y)
      const bottom = Math.max(start.y, end.y)

      const width = right - left
      const height = bottom - top

      // Enforce minimum size (5% of image dimensions)
      const minSize = 0.05
      const actualWidth = Math.max(width, minSize)
      const actualHeight = Math.max(height, minSize)

      // Center point of the box
      const centerX = left + width / 2
      const centerY = top + height / 2

      return {
        x: centerX,
        y: centerY,
        width: actualWidth,
        height: actualHeight,
      }
    },
    [],
  )

  const isInsideBoundingBox = useCallback(
    (x: number, y: number): boolean => {
      const left = hotspot.x - hotspot.width / 2
      const right = hotspot.x + hotspot.width / 2
      const top = hotspot.y - hotspot.height / 2
      const bottom = hotspot.y + hotspot.height / 2

      return x >= left && x <= right && y >= top && y <= bottom
    },
    [hotspot],
  )

  const getResizeHandle = useCallback(
    (x: number, y: number): string | null => {
      const left = hotspot.x - hotspot.width / 2
      const right = hotspot.x + hotspot.width / 2
      const top = hotspot.y - hotspot.height / 2
      const bottom = hotspot.y + hotspot.height / 2
      const threshold = 0.02 // 2% threshold for corner/edge detection

      // Corners (check these first)
      if (Math.abs(x - left) < threshold && Math.abs(y - top) < threshold)
        return 'nw'
      if (Math.abs(x - right) < threshold && Math.abs(y - top) < threshold)
        return 'ne'
      if (Math.abs(x - left) < threshold && Math.abs(y - bottom) < threshold)
        return 'sw'
      if (Math.abs(x - right) < threshold && Math.abs(y - bottom) < threshold)
        return 'se'

      // Edges
      if (Math.abs(x - left) < threshold && y >= top && y <= bottom) return 'w'
      if (Math.abs(x - right) < threshold && y >= top && y <= bottom) return 'e'
      if (Math.abs(y - top) < threshold && x >= left && x <= right) return 'n'
      if (Math.abs(y - bottom) < threshold && x >= left && x <= right)
        return 's'

      return null
    },
    [hotspot],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const coords = getRelativeCoordinates(e.clientX, e.clientY)
      if (!coords) return

      // Check if clicking on a resize handle
      const handle = getResizeHandle(coords.x, coords.y)
      if (handle) {
        setResizeHandle(handle)
        setResizeStart({ x: coords.x, y: coords.y, hotspot })
        setIsResizing(true)
        return
      }

      // Check if clicking inside existing bounding box
      if (isInsideBoundingBox(coords.x, coords.y)) {
        setMoveStart({
          x: coords.x,
          y: coords.y,
          hotspotX: hotspot.x,
          hotspotY: hotspot.y,
        })
        setIsMoving(true)
      } else {
        // Start creating new bounding box
        setDragStart(coords)
        setIsDragging(true)
      }
    },
    [getRelativeCoordinates, getResizeHandle, isInsideBoundingBox, hotspot],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const coords = getRelativeCoordinates(e.clientX, e.clientY)
      if (!coords) return

      if (isDragging && dragStart) {
        // Creating new bounding box
        const box = createBoundingBox(dragStart, coords)
        setLocalHotspot(box)
        onChange(box)
      } else if (isMoving && moveStart) {
        // Moving existing bounding box
        const deltaX = coords.x - moveStart.x
        const deltaY = coords.y - moveStart.y

        const newX = moveStart.hotspotX + deltaX
        const newY = moveStart.hotspotY + deltaY

        // Constrain to image bounds
        const halfWidth = hotspot.width / 2
        const halfHeight = hotspot.height / 2
        const clampedX = Math.max(halfWidth, Math.min(1 - halfWidth, newX))
        const clampedY = Math.max(halfHeight, Math.min(1 - halfHeight, newY))

        const movedBox = {
          ...hotspot,
          x: clampedX,
          y: clampedY,
        }
        setLocalHotspot(movedBox)
        onChange(movedBox)
      } else if (isResizing && resizeStart && resizeHandle) {
        // Resizing bounding box
        const deltaX = coords.x - resizeStart.x
        const deltaY = coords.y - resizeStart.y

        const original = resizeStart.hotspot
        let newLeft = original.x - original.width / 2
        let newRight = original.x + original.width / 2
        let newTop = original.y - original.height / 2
        let newBottom = original.y + original.height / 2

        // Update bounds based on which handle is being dragged
        if (resizeHandle.includes('n')) newTop += deltaY
        if (resizeHandle.includes('s')) newBottom += deltaY
        if (resizeHandle.includes('w')) newLeft += deltaX
        if (resizeHandle.includes('e')) newRight += deltaX

        // Enforce minimum size
        const minSize = 0.05
        if (newRight - newLeft < minSize) {
          if (resizeHandle.includes('w')) newLeft = newRight - minSize
          else newRight = newLeft + minSize
        }
        if (newBottom - newTop < minSize) {
          if (resizeHandle.includes('n')) newTop = newBottom - minSize
          else newBottom = newTop + minSize
        }

        // Constrain to image bounds
        newLeft = Math.max(0, newLeft)
        newRight = Math.min(1, newRight)
        newTop = Math.max(0, newTop)
        newBottom = Math.min(1, newBottom)

        const resizedBox = {
          x: (newLeft + newRight) / 2,
          y: (newTop + newBottom) / 2,
          width: newRight - newLeft,
          height: newBottom - newTop,
        }
        setLocalHotspot(resizedBox)
        onChange(resizedBox)
      }
    },
    [
      isDragging,
      isMoving,
      isResizing,
      dragStart,
      moveStart,
      resizeStart,
      resizeHandle,
      getRelativeCoordinates,
      createBoundingBox,
      onChange,
      hotspot,
    ],
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsMoving(false)
    setIsResizing(false)
    setDragStart(null)
    setMoveStart(null)
    setResizeStart(null)
    setResizeHandle(null)
  }, [])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      if (!touch) return
      const coords = getRelativeCoordinates(touch.clientX, touch.clientY)
      if (!coords) return

      // Check if touching on a resize handle
      const handle = getResizeHandle(coords.x, coords.y)
      if (handle) {
        setResizeHandle(handle)
        setResizeStart({ x: coords.x, y: coords.y, hotspot })
        setIsResizing(true)
        return
      }

      // Check if touching inside existing bounding box
      if (isInsideBoundingBox(coords.x, coords.y)) {
        setMoveStart({
          x: coords.x,
          y: coords.y,
          hotspotX: hotspot.x,
          hotspotY: hotspot.y,
        })
        setIsMoving(true)
      } else {
        // Start creating new bounding box
        setDragStart(coords)
        setIsDragging(true)
      }
    },
    [getRelativeCoordinates, getResizeHandle, isInsideBoundingBox, hotspot],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      if (!touch) return
      const coords = getRelativeCoordinates(touch.clientX, touch.clientY)
      if (!coords) return

      if (isDragging && dragStart) {
        // Creating new bounding box
        const box = createBoundingBox(dragStart, coords)
        setLocalHotspot(box)
        onChange(box)
      } else if (isMoving && moveStart) {
        // Moving existing bounding box
        const deltaX = coords.x - moveStart.x
        const deltaY = coords.y - moveStart.y

        const newX = moveStart.hotspotX + deltaX
        const newY = moveStart.hotspotY + deltaY

        // Constrain to image bounds
        const halfWidth = hotspot.width / 2
        const halfHeight = hotspot.height / 2
        const clampedX = Math.max(halfWidth, Math.min(1 - halfWidth, newX))
        const clampedY = Math.max(halfHeight, Math.min(1 - halfHeight, newY))

        const movedBox = {
          ...hotspot,
          x: clampedX,
          y: clampedY,
        }
        setLocalHotspot(movedBox)
        onChange(movedBox)
      } else if (isResizing && resizeStart && resizeHandle) {
        // Resizing bounding box
        const deltaX = coords.x - resizeStart.x
        const deltaY = coords.y - resizeStart.y

        const original = resizeStart.hotspot
        let newLeft = original.x - original.width / 2
        let newRight = original.x + original.width / 2
        let newTop = original.y - original.height / 2
        let newBottom = original.y + original.height / 2

        // Update bounds based on which handle is being dragged
        if (resizeHandle.includes('n')) newTop += deltaY
        if (resizeHandle.includes('s')) newBottom += deltaY
        if (resizeHandle.includes('w')) newLeft += deltaX
        if (resizeHandle.includes('e')) newRight += deltaX

        // Enforce minimum size
        const minSize = 0.05
        if (newRight - newLeft < minSize) {
          if (resizeHandle.includes('w')) newLeft = newRight - minSize
          else newRight = newLeft + minSize
        }
        if (newBottom - newTop < minSize) {
          if (resizeHandle.includes('n')) newTop = newBottom - minSize
          else newBottom = newTop + minSize
        }

        // Constrain to image bounds
        newLeft = Math.max(0, newLeft)
        newRight = Math.min(1, newRight)
        newTop = Math.max(0, newTop)
        newBottom = Math.min(1, newBottom)

        const resizedBox = {
          x: (newLeft + newRight) / 2,
          y: (newTop + newBottom) / 2,
          width: newRight - newLeft,
          height: newBottom - newTop,
        }
        setLocalHotspot(resizedBox)
        onChange(resizedBox)
      }
    },
    [
      isDragging,
      isMoving,
      isResizing,
      dragStart,
      moveStart,
      resizeStart,
      resizeHandle,
      getRelativeCoordinates,
      createBoundingBox,
      onChange,
      hotspot,
    ],
  )

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    setIsMoving(false)
    setIsResizing(false)
    setDragStart(null)
    setMoveStart(null)
    setResizeStart(null)
    setResizeHandle(null)
  }, [])

  const handleReset = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const defaultHotspot = { x: 0.5, y: 0.5, width: 0.3, height: 0.3 }
      setLocalHotspot(defaultHotspot)
      onChange(null)
    },
    [onChange],
  )

  const hasCustomHotspot =
    hotspot.x !== 0.5 ||
    hotspot.y !== 0.5 ||
    hotspot.width !== 0.3 ||
    hotspot.height !== 0.3

  // Calculate bounding box position
  const boxLeft = (hotspot.x - hotspot.width / 2) * 100
  const boxTop = (hotspot.y - hotspot.height / 2) * 100
  const boxWidth = hotspot.width * 100
  const boxHeight = hotspot.height * 100

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        ref={containerRef}
        className="relative h-64 w-full touch-none overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"
        style={{
          cursor: isMoving ? 'grabbing' : isResizing ? 'grabbing' : 'crosshair',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={imageUrl}
          alt={imageAlt || 'Preview'}
          className="pointer-events-none h-full w-full object-contain select-none"
          draggable={false}
        />

        {/* Bounding box overlay */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: `${boxLeft}%`,
            top: `${boxTop}%`,
            width: `${boxWidth}%`,
            height: `${boxHeight}%`,
            transition:
              isDragging || isMoving || isResizing
                ? 'none'
                : 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'grab',
          }}
        >
          {/* Aqua gradient border box without blur */}
          <div className="absolute inset-0 rounded border-2 border-[#3B82F6] bg-[#3B82F6]/10 shadow-lg">
            {/* Corner handles */}
            <div className="pointer-events-auto absolute -top-1.5 -left-1.5 h-3 w-3 cursor-nwse-resize rounded-full border-2 border-white bg-[#1D4ED8] shadow-md" />
            <div className="pointer-events-auto absolute -top-1.5 -right-1.5 h-3 w-3 cursor-nesw-resize rounded-full border-2 border-white bg-[#1D4ED8] shadow-md" />
            <div className="pointer-events-auto absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize rounded-full border-2 border-white bg-[#1D4ED8] shadow-md" />
            <div className="pointer-events-auto absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-full border-2 border-white bg-[#1D4ED8] shadow-md" />

            {/* Edge handles */}
            <div className="pointer-events-auto absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 cursor-ns-resize rounded-full border-2 border-white bg-[#1D4ED8] shadow-md" />
            <div className="pointer-events-auto absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 cursor-ns-resize rounded-full border-2 border-white bg-[#1D4ED8] shadow-md" />
            <div className="pointer-events-auto absolute top-1/2 -left-1.5 h-3 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-[#1D4ED8] shadow-md" />
            <div className="pointer-events-auto absolute top-1/2 -right-1.5 h-3 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-[#1D4ED8] shadow-md" />

            {/* Center crosshair */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="h-4 w-px bg-white shadow-sm" />
              <div className="absolute top-1/2 left-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-white shadow-sm" />
              <div className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#06B6D4] shadow-md" />
            </div>
          </div>

          {/* Animated pulse effect for active dragging or moving */}
          {(isDragging || isMoving || isResizing) && (
            <div className="absolute inset-0 animate-pulse rounded border-2 border-[#06B6D4] opacity-50" />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-gray-600 dark:text-gray-400">
        <span className="font-inter flex items-center gap-1.5">
          {hasCustomHotspot ? (
            <>
              <span className="text-[#1D4ED8]">📦</span>
              <span>
                Focal area: {Math.round(boxWidth)}% × {Math.round(boxHeight)}%
              </span>
            </>
          ) : (
            <>
              <span>🎯</span>
              <span>
                Drag to select • Click inside to move • Drag handles to resize
              </span>
            </>
          )}
        </span>
        {hasCustomHotspot && (
          <button
            type="button"
            onClick={handleReset}
            className="font-space-grotesk font-medium text-[#1D4ED8] transition-colors hover:text-[#06B6D4] dark:text-[#3B82F6] dark:hover:text-[#06B6D4]"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
