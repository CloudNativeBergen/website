'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import SignaturePad from 'signature_pad'

interface SignaturePadCanvasProps {
  onSignatureChange: (dataUrl: string | null) => void
  width?: number
  height?: number
  disabled?: boolean
}

export function SignaturePadCanvas({
  onSignatureChange,
  width = 500,
  height = 200,
  disabled = false,
}: SignaturePadCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const onChangeRef = useRef(onSignatureChange)
  const [isEmpty, setIsEmpty] = useState(true)

  // Keep the callback ref current without triggering effect re-runs
  useEffect(() => {
    onChangeRef.current = onSignatureChange
  }, [onSignatureChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(20, 20, 20)',
      minWidth: 1,
      maxWidth: 2.5,
      velocityFilterWeight: 0.7,
    })

    pad.addEventListener('endStroke', () => {
      setIsEmpty(pad.isEmpty())
      if (!pad.isEmpty()) {
        onChangeRef.current(pad.toDataURL('image/png'))
      }
    })

    padRef.current = pad

    // Handle high-DPI displays
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext('2d')?.scale(ratio, ratio)
    pad.clear()

    return () => {
      pad.off()
    }
  }, [])

  useEffect(() => {
    if (padRef.current) {
      if (disabled) {
        padRef.current.off()
      } else {
        padRef.current.on()
      }
    }
  }, [disabled])

  // Resize handler for responsive canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver(() => {
      const pad = padRef.current
      if (!pad) return

      const data = pad.toData()
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext('2d')?.scale(ratio, ratio)
      pad.clear()
      if (data.length > 0) {
        pad.fromData(data)
      }
    })

    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  const handleClear = useCallback(() => {
    padRef.current?.clear()
    setIsEmpty(true)
    onChangeRef.current(null)
  }, [])

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full touch-none"
          style={{ height: `${height}px` }}
          aria-label="Signature pad"
        />
        {isEmpty && !disabled && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-slate-400">Draw your signature above</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Use your mouse or finger to sign
        </p>
        <button
          type="button"
          onClick={handleClear}
          disabled={isEmpty || disabled}
          className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40"
        >
          Clear signature
        </button>
      </div>
    </div>
  )
}
