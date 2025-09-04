/**
 * Unified curve calculation utilities for target tracking
 *
 * This module provides a single source of truth for all curve calculations
 * used throughout the application for target progression.
 */

import type { TargetCurve } from '@/lib/tickets/targets'

/**
 * Calculate curve progression value for a given time parameter t (0 to 1)
 *
 * This is the authoritative implementation that matches the backend
 * target-calculations.ts function.
 */
export function calculateCurveValue(curve: TargetCurve, t: number): number {
  // Ensure t is between 0 and 1
  t = Math.max(0, Math.min(1, t))

  switch (curve) {
    case 'linear':
      return t

    case 'early_push':
      // Quadratic ease-out: fast start, slow end
      return 1 - Math.pow(1 - t, 2)

    case 'late_push':
      // Cubic ease-in: slow start, fast end
      return Math.pow(t, 3)

    case 's_curve':
      // Smoothstep function: slow-fast-slow S-curve
      return 3 * t * t - 2 * t * t * t

    default:
      return t
  }
}

/**
 * Generate curve data points for visualization
 *
 * @param curve - The curve type to generate
 * @param points - Number of data points to generate (default: 50)
 * @param scale - Scale factor for the output values (default: 100 for percentages)
 * @returns Array of scaled curve values
 */
export function generateCurveData(
  curve: TargetCurve,
  points: number = 50,
  scale: number = 100,
): number[] {
  const data: number[] = []

  for (let i = 0; i <= points; i++) {
    const t = i / points // 0 to 1
    const value = calculateCurveValue(curve, t) * scale
    data.push(Math.max(0, Math.min(scale, value)))
  }

  return data
}

/**
 * Generate SVG path string for curve visualization
 *
 * @param curve - The curve type to generate
 * @param width - SVG width in pixels
 * @param height - SVG height in pixels
 * @param points - Number of points to sample (default: 20 for smooth curves)
 * @returns SVG path string
 */
export function generateCurveSVGPath(
  curve: TargetCurve,
  width: number,
  height: number,
  points: number = 20,
): string {
  const data = generateCurveData(curve, points, 1) // Scale to 0-1

  if (data.length === 0) return ''

  const stepX = width / (data.length - 1)
  let path = ''

  data.forEach((value, index) => {
    // Round to 3 decimal places to ensure consistent server/client rendering
    const x = Math.round(index * stepX * 1000) / 1000
    const y = Math.round((height - value * height) * 1000) / 1000 // Flip Y axis (SVG origin is top-left)

    if (index === 0) {
      path += `M ${x} ${y}`
    } else {
      path += ` L ${x} ${y}`
    }
  })

  return path
}

/**
 * Get curve metadata for UI display
 */
export function getCurveMetadata(curve: TargetCurve) {
  const metadata: Record<TargetCurve, { name: string; description: string }> = {
    linear: {
      name: 'Linear',
      description: 'Steady, consistent progress throughout the period',
    },
    early_push: {
      name: 'Early Push',
      description: 'Aggressive early sales with gradual tapering',
    },
    late_push: {
      name: 'Late Push',
      description: 'Slow start building to strong finish',
    },
    s_curve: {
      name: 'S-Curve',
      description: 'Gradual start, rapid middle, gentle finish',
    },
  }

  return metadata[curve] || metadata.linear
}
