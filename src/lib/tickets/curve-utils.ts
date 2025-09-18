import type { TargetCurve } from './types'

export function calculateCurveValue(
  progress: number,
  curve: TargetCurve,
): number {
  if (progress >= 1) return 1
  if (progress <= 0) return 0

  switch (curve) {
    case 'linear':
      return progress
    case 'early_push':
      return Math.sqrt(progress)
    case 'late_push':
      return Math.pow(progress, 3)
    case 's_curve':
      const k = 8
      const x = progress * k - k / 2
      const sigmoid = 1 / (1 + Math.exp(-x))
      const maxSigmoid = 1 / (1 + Math.exp(-k / 2))
      return sigmoid / maxSigmoid
    default:
      return progress
  }
}

export function generateCurveData(
  curve: TargetCurve,
  points = 100,
): Array<{ x: number; y: number }> {
  const data: Array<{ x: number; y: number }> = []

  for (let i = 0; i <= points; i++) {
    const x = i / points
    const y = calculateCurveValue(x, curve)
    data.push({ x, y })
  }

  return data
}

export function generateCurveSVGPath(
  curve: TargetCurve,
  width = 200,
  height = 100,
): string {
  const points = generateCurveData(curve, 50)

  let path = `M 0 ${height}`

  points.forEach((point, index) => {
    const x = point.x * width
    const y = height - point.y * height

    if (index === 0) {
      path += ` L ${x} ${y}`
    } else {
      path += ` L ${x} ${y}`
    }
  })

  return path
}

export function getCurveMetadata(curve: TargetCurve) {
  const metadata = {
    linear: {
      name: 'Linear',
      description: 'Steady, consistent growth throughout the period',
      icon: '📈',
    },
    early_push: {
      name: 'Early Push',
      description: 'Front-loaded sales with early momentum',
      icon: '🚀',
    },
    late_push: {
      name: 'Late Push',
      description: 'Back-loaded sales with final sprint',
      icon: '🏃‍♂️',
    },
    s_curve: {
      name: 'S-Curve',
      description: 'Slow start, rapid middle, steady end',
      icon: '〰️',
    },
  }

  return metadata[curve] || metadata.linear
}
