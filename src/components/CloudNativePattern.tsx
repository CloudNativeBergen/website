'use client'

import React, { useMemo, useRef } from 'react'
import Image from 'next/image'

// Import all cloud native SVG icons
import KubernetesIcon from '@/images/icons/kubernetes-icon-white.svg'
import HelmIcon from '@/images/icons/helm-icon-white.svg'
import PrometheusIcon from '@/images/icons/prometheus-icon-white.svg'
import IstioIcon from '@/images/icons/istio-icon-white.svg'
import EnvoyIcon from '@/images/icons/envoy-icon-white.svg'
import JaegerIcon from '@/images/icons/jaeger-icon-white.svg'
import ArgoIcon from '@/images/icons/argo-icon-white.svg'
import BackstageIcon from '@/images/icons/backstage-icon-white.svg'
import CertManagerIcon from '@/images/icons/cert-manager-icon-white.svg'
import CiliumIcon from '@/images/icons/cilium_icon-white.svg'
import CloudNativePGIcon from '@/images/icons/cloudnativepg-icon-white.svg'
import ContainerdIcon from '@/images/icons/containerd-icon-white.svg'
import CoreDNSIcon from '@/images/icons/coredns-icon-white.svg'
import CrossplaneIcon from '@/images/icons/crossplane-icon-white.svg'
import EtcdIcon from '@/images/icons/etcd-icon-white.svg'
import FalcoIcon from '@/images/icons/falco-icon-white.svg'
import FluxIcon from '@/images/icons/flux-icon-white.svg'
import GRPCIcon from '@/images/icons/grpc-icon-white.svg'
import KyvernoIcon from '@/images/icons/kyverno-icon-white.svg'
import HarborIcon from '@/images/icons/harbor-icon-white.svg'
import KubevirtIcon from '@/images/icons/kubevirt-icon-white.svg'
import KuredIcon from '@/images/icons/kured-icon-white.svg'
import LinkerdIcon from '@/images/icons/linkerd-icon-white.svg'
import LoggingOperatorIcon from '@/images/icons/logging-operator-icon-white.svg'
import OpenFeatureIcon from '@/images/icons/openfeature-icon-white.svg'
import OpenTelemetryIcon from '@/images/icons/opentelemetry-icon-white.svg'
import OperatorFrameworkIcon from '@/images/icons/operatorframework-icon-white.svg'
import ShipwrightIcon from '@/images/icons/shipwright-icon-white.svg'
import VirtualKubeletIcon from '@/images/icons/virtualkubelet-icon-white.svg'
import VitessIcon from '@/images/icons/vitess-icon-white.svg'
import WasmEdgeRuntimeIcon from '@/images/icons/wasm-edge-runtime-icon-white.svg'
import WasmCloudIcon from '@/images/icons/wasmcloud.icon_inversed.svg'

// Types
type IconCategory = 'popular' | 'moderate' | 'specialized'
type Variant = 'dark' | 'light' | 'brand'

interface BaseIcon {
  icon: string
  name: string
  weight: number
}

interface IconData extends Omit<BaseIcon, 'weight'> {
  category: IconCategory
}

interface DepthLayer {
  name: string
  zIndex: number
  sizeRange: [number, number]
  opacityMultiplier: number
  blur: number
  frequency: number
  animationSpeedMultiplier: number
  brightness: number
}

// Constants and Configuration
const POPULAR_ICONS: BaseIcon[] = [
  { icon: KubernetesIcon, name: 'Kubernetes', weight: 30 },
  { icon: HelmIcon, name: 'Helm', weight: 25 },
  { icon: PrometheusIcon, name: 'Prometheus', weight: 25 },
  { icon: IstioIcon, name: 'Istio', weight: 20 },
  { icon: ArgoIcon, name: 'Argo', weight: 20 },
  { icon: FluxIcon, name: 'Flux', weight: 20 },
  { icon: OpenTelemetryIcon, name: 'OpenTelemetry', weight: 18 },
  { icon: BackstageIcon, name: 'Backstage', weight: 18 },
] as const

const MODERATELY_KNOWN_ICONS: BaseIcon[] = [
  { icon: EnvoyIcon, name: 'Envoy', weight: 15 },
  { icon: JaegerIcon, name: 'Jaeger', weight: 15 },
  { icon: LinkerdIcon, name: 'Linkerd', weight: 14 },
  { icon: HarborIcon, name: 'Harbor', weight: 13 },
  { icon: CertManagerIcon, name: 'Cert Manager', weight: 12 },
  { icon: EtcdIcon, name: 'Etcd', weight: 12 },
  { icon: ContainerdIcon, name: 'Containerd', weight: 12 },
  { icon: VitessIcon, name: 'Vitess', weight: 11 },
  { icon: CoreDNSIcon, name: 'CoreDNS', weight: 10 },
  { icon: GRPCIcon, name: 'gRPC', weight: 10 },
  { icon: OperatorFrameworkIcon, name: 'Operator Framework', weight: 10 },
] as const

const SPECIALIZED_ICONS: BaseIcon[] = [
  { icon: CiliumIcon, name: 'Cilium', weight: 8 },
  { icon: CrossplaneIcon, name: 'Crossplane', weight: 8 },
  { icon: FalcoIcon, name: 'Falco', weight: 8 },
  { icon: KubevirtIcon, name: 'KubeVirt', weight: 7 },
  { icon: OpenFeatureIcon, name: 'OpenFeature', weight: 7 },
  { icon: KyvernoIcon, name: 'Kyverno', weight: 6 },
  { icon: ShipwrightIcon, name: 'Shipwright', weight: 6 },
  { icon: VirtualKubeletIcon, name: 'Virtual Kubelet', weight: 5 },
  { icon: CloudNativePGIcon, name: 'CloudNativePG', weight: 5 },
  { icon: LoggingOperatorIcon, name: 'Logging Operator', weight: 5 },
  { icon: KuredIcon, name: 'Kured', weight: 4 },
  { icon: WasmEdgeRuntimeIcon, name: 'WasmEdge Runtime', weight: 4 },
  { icon: WasmCloudIcon, name: 'wasmCloud', weight: 4 },
] as const

const COLOR_SCHEMES = {
  dark: [
    'text-white',
    'text-gray-100',
    'text-blue-200',
    'text-cyan-200',
    'text-purple-200',
    'text-indigo-200',
    'text-teal-200',
    'text-sky-200',
  ],
  light: [
    'text-gray-800',
    'text-blue-800',
    'text-cyan-800',
    'text-purple-800',
    'text-indigo-800',
    'text-teal-800',
    'text-sky-800',
    'text-violet-800',
    'text-slate-800',
    'text-emerald-800',
  ],
  brand: [
    'text-blue-400',
    'text-cyan-400',
    'text-purple-400',
    'text-indigo-400',
    'text-teal-400',
    'text-blue-300',
    'text-purple-300',
    'text-cyan-300',
  ],
} as const

const CATEGORY_MULTIPLIERS = {
  popular: 1.2,
  moderate: 1.0,
  specialized: 0.8,
} as const

// Utility Functions
const createWeightedIconPool = (): IconData[] => {
  const pool: IconData[] = []

  const addIconsToPool = (
    icons: readonly BaseIcon[],
    category: IconCategory,
  ) => {
    icons.forEach(({ icon, name, weight }) => {
      for (let i = 0; i < weight; i++) {
        pool.push({ icon, name, category })
      }
    })
  }

  addIconsToPool(POPULAR_ICONS, 'popular')
  addIconsToPool(MODERATELY_KNOWN_ICONS, 'moderate')
  addIconsToPool(SPECIALIZED_ICONS, 'specialized')

  return pool
}

// Seeded random number generator for consistent but varied patterns
class SeededRandom {
  private seed: number

  constructor(seed: number) {
    this.seed = seed
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296
    return this.seed / 4294967296
  }
}

const createDepthLayers = (
  baseSize: number,
  variant: Variant,
): DepthLayer[] => [
  {
    name: 'background',
    zIndex: 1,
    sizeRange: [baseSize * 0.5, baseSize * 0.7],
    opacityMultiplier:
      variant === 'light' ? 0.5 : variant === 'dark' ? 0.4 : 0.5,
    blur: 2.0,
    frequency: 0.5,
    animationSpeedMultiplier: 1.5,
    brightness: variant === 'light' ? 1.0 : variant === 'dark' ? 0.8 : 0.9,
  },
  {
    name: 'midground',
    zIndex: 10,
    sizeRange: [baseSize * 0.8, baseSize * 1.2],
    opacityMultiplier:
      variant === 'light' ? 0.7 : variant === 'dark' ? 0.6 : 0.8,
    blur: 0.8,
    frequency: 0.35,
    animationSpeedMultiplier: 1.0,
    brightness: variant === 'light' ? 1.1 : variant === 'dark' ? 0.9 : 1.1,
  },
  {
    name: 'foreground',
    zIndex: 20,
    sizeRange: [baseSize * 1.3, baseSize * 1.6],
    opacityMultiplier:
      variant === 'light' ? 0.9 : variant === 'dark' ? 0.8 : 1.2,
    blur: 0,
    frequency: 0.15,
    animationSpeedMultiplier: 0.7,
    brightness: variant === 'light' ? 1.2 : variant === 'dark' ? 1.0 : 1.3,
  },
]

interface CloudNativePatternProps {
  /**
   * Additional CSS classes to apply to the container element
   * @default ''
   */
  className?: string

  /**
   * Overall opacity of the icon pattern
   * Controls the transparency of all icons in the pattern
   * @default 0.15
   * @range 0.0 to 1.0
   */
  opacity?: number

  /**
   * Whether icons should have floating animations
   * When enabled, icons will gently float with different speeds and delays
   * @default true
   */
  animated?: boolean

  /**
   * Visual variant that controls color scheme and styling
   * - 'dark': Blue/cyan/purple tones for dark backgrounds
   * - 'light': Dark grays/blacks with inverted styling for light backgrounds
   * - 'brand': Brand colors (blue/cyan/purple) suitable for most contexts
   * @default 'brand'
   */
  variant?: Variant

  /**
   * Base size for icons in the midground layer (in pixels)
   * - Background icons will be 50%-70% of this size
   * - Midground icons will be 80%-120% of this size
   * - Foreground icons will be 130%-160% of this size
   * @default 45
   * @range Recommended: 20-100 pixels
   */
  baseSize?: number

  /**
   * Total number of icons to display in the pattern
   * Icons are distributed across three depth layers (background, midground, foreground)
   * @default 50
   * @range Recommended: 10-200 icons for optimal performance
   */
  iconCount?: number

  /**
   * Seed value for the random number generator
   * Allows for consistent but customizable patterns - use different seeds to find suitable arrangements
   * @default undefined (uses computed seed based on props)
   * @range Any positive integer
   * @example
   * // Try different seeds to find visually appealing patterns:
   * seed={42}    // Balanced distribution
   * seed={123}   // More clustered icons
   * seed={999}   // Sparse arrangement
   * seed={1337}  // Dense pattern
   */
  seed?: number
}

export function CloudNativePattern({
  className = '',
  opacity = 0.15,
  animated = true,
  variant = 'brand',
  baseSize = 45,
  iconCount = 50,
  seed,
}: CloudNativePatternProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Memoized icon pool to avoid recreation on every render
  const iconPool = useMemo(() => createWeightedIconPool(), [])

  // Memoized depth layers configuration
  const depthLayers = useMemo(
    () => createDepthLayers(baseSize, variant),
    [baseSize, variant],
  )

  // Generate icon elements with optimized rendering and better distribution
  const iconElements = useMemo(() => {
    const elements: React.JSX.Element[] = []
    const colors = COLOR_SCHEMES[variant]
    let currentIconIndex = 0

    // Create seeded random generator for consistent patterns
    const computedSeed =
      seed ??
      iconCount +
        baseSize +
        (variant === 'light' ? 1000 : variant === 'dark' ? 2000 : 3000)
    const seededRandom = new SeededRandom(computedSeed)

    // Create a grid-based distribution system to prevent clustering
    const createDistributedPositions = (count: number) => {
      const positions: { x: number; y: number }[] = []

      // Calculate grid dimensions - aim for roughly square cells
      const gridCols = Math.ceil(Math.sqrt(count * 1.2)) // 1.2 factor for better spacing
      const gridRows = Math.ceil(count / gridCols)

      // Calculate cell dimensions (in percentage)
      const cellWidth = 100 / gridCols
      const cellHeight = 100 / gridRows

      // Generate shuffled grid positions to avoid predictable patterns
      const gridCells: { col: number; row: number }[] = []
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          gridCells.push({ col, row })
        }
      }

      // Shuffle the grid cells using seeded random for consistency
      for (let i = gridCells.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom.next() * (i + 1))
        ;[gridCells[i], gridCells[j]] = [gridCells[j], gridCells[i]]
      }

      // Assign positions with jitter within each cell
      for (let i = 0; i < count && i < gridCells.length; i++) {
        const { col, row } = gridCells[i]

        // Calculate base position (center of cell)
        const baseCellX = col * cellWidth + cellWidth / 2
        const baseCellY = row * cellHeight + cellHeight / 2

        // Add jitter within the cell (up to 40% of cell size from center)
        const jitterRange = 0.4
        const jitterX = (seededRandom.next() - 0.5) * cellWidth * jitterRange
        const jitterY = (seededRandom.next() - 0.5) * cellHeight * jitterRange

        // Final position with bounds checking
        const x = Math.max(5, Math.min(95, baseCellX + jitterX))
        const y = Math.max(5, Math.min(95, baseCellY + jitterY))

        positions.push({ x, y })
      }

      return positions
    }

    // Pre-generate all positions for better distribution
    const allPositions = createDistributedPositions(iconCount)
    let positionIndex = 0

    depthLayers.forEach((layer) => {
      const layerIconCount = Math.floor(iconCount * layer.frequency)

      for (let i = 0; i < layerIconCount && currentIconIndex < iconCount; i++) {
        currentIconIndex++

        // Select icon from weighted pool using seeded random
        const selectedIcon =
          iconPool[Math.floor(seededRandom.next() * iconPool.length)]
        const size =
          seededRandom.next() * (layer.sizeRange[1] - layer.sizeRange[0]) +
          layer.sizeRange[0]

        // Use pre-calculated distributed position
        const position = allPositions[positionIndex % allPositions.length]
        const x = position.x
        const y = position.y
        positionIndex++

        const animationDelay = seededRandom.next() * 20
        const baseAnimationDuration = 15 + seededRandom.next() * 10
        const animationDuration =
          baseAnimationDuration * layer.animationSpeedMultiplier
        const color = colors[Math.floor(seededRandom.next() * colors.length)]

        // Calculate opacity with category-based multipliers
        const categoryMultiplier = CATEGORY_MULTIPLIERS[selectedIcon.category]
        const finalOpacity =
          opacity * layer.opacityMultiplier * categoryMultiplier

        // Apply perspective scaling for depth effect
        const perspectiveScale =
          layer.name === 'background'
            ? 1 - (Math.abs(x - 50) + Math.abs(y - 50)) * 0.001
            : 1
        const finalSize = size * perspectiveScale

        // Create filter styles based on variant
        const filterStyle =
          variant === 'light'
            ? `invert(1) brightness(${layer.brightness * 0.3}) contrast(1.2) saturate(1.1)`
            : variant === 'dark'
              ? `brightness(${layer.brightness * 1.2}) contrast(1.3) saturate(0.8) hue-rotate(5deg)`
              : `brightness(${layer.brightness}) sepia(${0.3 * layer.brightness}) saturate(${1.3 * layer.brightness})`

        elements.push(
          <div
            key={`${layer.name}-${i}-${selectedIcon.name}-${currentIconIndex}`}
            className={`absolute ${color} transition-all duration-500`}
            style={{
              width: `${finalSize}px`,
              height: `${finalSize}px`,
              left: `${x}%`,
              top: `${y}%`,
              opacity: Math.min(finalOpacity, 1),
              zIndex: layer.zIndex,
              animation: animated
                ? `float ${animationDuration}s ease-in-out infinite ${animationDelay}s`
                : 'none',
              filter: layer.blur > 0 ? `blur(${layer.blur}px)` : 'none',
              transform:
                layer.name === 'background' ? 'scale(0.98)' : 'scale(1)',
            }}
          >
            <Image
              src={selectedIcon.icon}
              alt={selectedIcon.name}
              width={Math.round(finalSize)}
              height={Math.round(finalSize)}
              className="h-full w-full object-contain"
              style={{ filter: filterStyle }}
              loading="lazy"
              decoding="async"
            />
          </div>,
        )
      }
    })

    return elements
  }, [
    iconCount,
    iconPool,
    depthLayers,
    variant,
    opacity,
    animated,
    seed,
    baseSize,
  ])

  // Memoized background gradients
  const backgroundGradients = useMemo(() => {
    if (variant === 'light') {
      return {
        deep: 'bg-gradient-to-r from-blue-50/5 via-purple-50/8 to-cyan-50/5',
        mid: 'bg-gradient-to-br from-cyan-50/6 via-transparent to-indigo-50/6',
        foreground:
          'bg-gradient-to-t from-transparent via-transparent to-blue-50/3',
      }
    } else if (variant === 'dark') {
      return {
        deep: 'bg-gradient-to-r from-blue-950/10 via-purple-950/12 to-cyan-950/10',
        mid: 'bg-gradient-to-br from-cyan-950/8 via-transparent to-indigo-950/8',
        foreground:
          'bg-gradient-to-t from-transparent via-slate-950/5 to-blue-950/6',
      }
    } else {
      return {
        deep: 'bg-gradient-to-r from-blue-900/15 via-purple-900/20 to-cyan-900/15',
        mid: 'bg-gradient-to-br from-cyan-900/12 via-transparent to-indigo-900/12',
        foreground:
          'bg-gradient-to-t from-transparent via-transparent to-blue-900/8',
      }
    }
  }, [variant])

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {/* Deep background gradient for atmospheric depth */}
      <div className={`absolute inset-0 ${backgroundGradients.deep}`} />

      {/* Mid-depth atmospheric layer */}
      <div className={`absolute inset-0 ${backgroundGradients.mid}`} />

      {/* Cloud Native Icons with proper depth layering */}
      <div className="absolute inset-0" style={{ perspective: '1000px' }}>
        {iconElements}
      </div>

      {/* Foreground atmospheric enhancement */}
      <div
        className={`pointer-events-none absolute inset-0 ${backgroundGradients.foreground}`}
      />
    </div>
  )
}
