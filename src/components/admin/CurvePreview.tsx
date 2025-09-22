'use client'

import { useMemo } from 'react'
import type { TargetCurve } from '@/lib/tickets/types'
import {
  generateCurveData,
  generateCurveSVGPath,
  getCurveMetadata,
} from '@/lib/tickets/curve-utils'

interface CurvePreviewProps {
  curve: TargetCurve
  isSelected?: boolean
  onClick?: () => void
  className?: string
}

const CURVE_COLORS = {
  linear: '#3B82F6',
  early_push: '#10B981',
  late_push: '#F59E0B',
  s_curve: '#8B5CF6',
} as const

export function CurvePreview({
  curve,
  isSelected = false,
  onClick,
  className = '',
}: CurvePreviewProps) {
  const curveData = useMemo(() => generateCurveData(curve, 100), [curve])
  const metadata = getCurveMetadata(curve)
  const color = CURVE_COLORS[curve]

  const svgPath = useMemo(() => {
    return generateCurveSVGPath(curve, 80, 40)
  }, [curve])

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative rounded-lg border-2 p-3 transition-all duration-200 hover:shadow-md focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-gray-800 ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md dark:border-blue-400 dark:bg-blue-900/20'
          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'} ${className} `}
    >
      {isSelected && (
        <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-800"></div>
      )}

      <div className="mb-2 flex justify-center">
        <svg
          width="80"
          height="40"
          viewBox="0 0 80 40"
          className="overflow-visible"
          suppressHydrationWarning
        >
          <defs>
            <pattern
              id={`grid-${curve}`}
              width="20"
              height="10"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-gray-200 dark:text-gray-600"
                opacity="0.5"
              />
            </pattern>
          </defs>

          <rect width="80" height="40" fill={`url(#grid-${curve})`} />

          <path
            d={svgPath}
            fill="none"
            stroke={isSelected ? color : '#9CA3AF'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-colors duration-200"
          />

          {curveData.map((point, index) => {
            if (index % 3 !== 0) return null
            const x = (index / (curveData.length - 1)) * 80
            const y = 40 - (point.y / 1) * 40

            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="1.5"
                fill={isSelected ? color : '#9CA3AF'}
                className="transition-colors duration-200"
              />
            )
          })}
        </svg>
      </div>

      <div className="text-center">
        <div
          className={`text-sm font-medium transition-colors duration-200 ${
            isSelected
              ? 'text-blue-900 dark:text-blue-100'
              : 'text-gray-900 dark:text-white'
          }`}
        >
          {metadata.name}
        </div>
        <div
          className={`text-xs transition-colors duration-200 ${
            isSelected
              ? 'text-blue-700 dark:text-blue-300'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {metadata.description}
        </div>
      </div>
    </button>
  )
}

interface CurveSelectionGridProps {
  selected: TargetCurve
  onSelect: (curve: TargetCurve) => void
  disabled?: boolean
  className?: string
}

export function CurveSelectionGrid({
  selected,
  onSelect,
  disabled = false,
  className = '',
}: CurveSelectionGridProps) {
  const curves: TargetCurve[] = ['linear', 'early_push', 'late_push', 's_curve']

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${className}`}>
      {curves.map((curve) => (
        <CurvePreview
          key={curve}
          curve={curve}
          isSelected={selected === curve}
          onClick={disabled ? undefined : () => onSelect(curve)}
        />
      ))}
    </div>
  )
}
