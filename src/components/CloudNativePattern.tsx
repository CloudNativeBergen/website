'use client'

import React, { useMemo } from 'react'
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

// Categorize icons by popularity/recognition level
const popularIcons = [
  { icon: KubernetesIcon, name: 'Kubernetes', weight: 30 }, // Most popular
  { icon: HelmIcon, name: 'Helm', weight: 25 },
  { icon: PrometheusIcon, name: 'Prometheus', weight: 25 },
  { icon: IstioIcon, name: 'Istio', weight: 20 },
  { icon: ArgoIcon, name: 'Argo', weight: 20 },
  { icon: OpenTelemetryIcon, name: 'OpenTelemetry', weight: 18 }, // Growing popularity in observability
]

const moderatelyKnownIcons = [
  { icon: EnvoyIcon, name: 'Envoy', weight: 15 },
  { icon: JaegerIcon, name: 'Jaeger', weight: 15 },
  { icon: LinkerdIcon, name: 'Linkerd', weight: 14 }, // Popular service mesh
  { icon: HarborIcon, name: 'Harbor', weight: 13 }, // Well-known registry
  { icon: CertManagerIcon, name: 'Cert Manager', weight: 12 },
  { icon: EtcdIcon, name: 'Etcd', weight: 12 },
  { icon: ContainerdIcon, name: 'Containerd', weight: 12 },
  { icon: VitessIcon, name: 'Vitess', weight: 11 }, // Database scaling
  { icon: CoreDNSIcon, name: 'CoreDNS', weight: 10 },
  { icon: GRPCIcon, name: 'gRPC', weight: 10 },
  { icon: OperatorFrameworkIcon, name: 'Operator Framework', weight: 10 },
]

const specializedIcons = [
  { icon: BackstageIcon, name: 'Backstage', weight: 8 },
  { icon: CiliumIcon, name: 'Cilium', weight: 8 },
  { icon: CrossplaneIcon, name: 'Crossplane', weight: 8 },
  { icon: FalcoIcon, name: 'Falco', weight: 8 },
  { icon: KubevirtIcon, name: 'KubeVirt', weight: 7 }, // Virtualization
  { icon: OpenFeatureIcon, name: 'OpenFeature', weight: 7 }, // Feature flags
  { icon: KyvernoIcon, name: 'Kyverno', weight: 6 },
  { icon: ShipwrightIcon, name: 'Shipwright', weight: 6 }, // Build framework
  { icon: VirtualKubeletIcon, name: 'Virtual Kubelet', weight: 5 },
  { icon: CloudNativePGIcon, name: 'CloudNativePG', weight: 5 },
  { icon: LoggingOperatorIcon, name: 'Logging Operator', weight: 5 },
  { icon: KuredIcon, name: 'Kured', weight: 4 }, // Node reboot daemon
  { icon: WasmEdgeRuntimeIcon, name: 'WasmEdge Runtime', weight: 4 }, // WebAssembly
  { icon: WasmCloudIcon, name: 'wasmCloud', weight: 4 }, // WebAssembly platform
]

// Create weighted icon pool for selection
interface IconData {
  icon: string
  name: string
  category: 'popular' | 'moderate' | 'specialized'
}

const createWeightedIconPool = (): IconData[] => {
  const pool: IconData[] = []

  // Add popular icons with higher frequency
  popularIcons.forEach(({ icon, name, weight }) => {
    for (let i = 0; i < weight; i++) {
      pool.push({ icon, name, category: 'popular' })
    }
  })

  // Add moderately known icons
  moderatelyKnownIcons.forEach(({ icon, name, weight }) => {
    for (let i = 0; i < weight; i++) {
      pool.push({ icon, name, category: 'moderate' })
    }
  })

  // Add specialized icons with lower frequency
  specializedIcons.forEach(({ icon, name, weight }) => {
    for (let i = 0; i < weight; i++) {
      pool.push({ icon, name, category: 'specialized' })
    }
  })

  return pool
}

interface CloudNativePatternProps {
  className?: string
  opacity?: number
  animated?: boolean
  variant?: 'dark' | 'light' | 'brand'
  density?: 'low' | 'medium' | 'high'
  minCount?: number
  maxCount?: number
  minSize?: number
  maxSize?: number
}

export function CloudNativePattern({
  className = '',
  opacity = 0.15,
  animated = true,
  variant = 'brand',
  density = 'medium',
  minCount = 40,
  maxCount = 80,
  minSize = 30,
  maxSize = 60,
}: CloudNativePatternProps) {
  // Generate random positions and properties for icons with depth layers
  const iconElements = useMemo(() => {
    const elements: React.JSX.Element[] = []
    const iconPool = createWeightedIconPool()

    // Calculate depth layers relative to minSize and maxSize
    const sizeRange = maxSize - minSize
    const depthLayersWithSize = [
      {
        name: 'background',
        zIndex: 1,
        sizeRange: [
          minSize - sizeRange * 0.3, // 30% smaller than minSize
          minSize - sizeRange * 0.1, // 10% smaller than minSize
        ] as [number, number],
        opacityMultiplier: variant === 'light' ? 0.4 : 0.3, // Higher opacity for light variant
        blur: 2.0,
        frequency: 0.5,
        animationSpeedMultiplier: 1.5,
        brightness: 0.6,
      },
      {
        name: 'midground',
        zIndex: 10,
        sizeRange: [minSize, maxSize] as [number, number], // Base size range
        opacityMultiplier: variant === 'light' ? 0.7 : 0.6, // Higher opacity for light variant
        blur: 0.8,
        frequency: 0.35,
        animationSpeedMultiplier: 1.0,
        brightness: 0.8,
      },
      {
        name: 'foreground',
        zIndex: 20,
        sizeRange: [
          maxSize + sizeRange * 0.1, // 10% larger than maxSize
          maxSize + sizeRange * 0.4, // 40% larger than maxSize
        ] as [number, number],
        opacityMultiplier: variant === 'light' ? 1.0 : 0.9, // Higher opacity for light variant
        blur: 0,
        frequency: 0.15,
        animationSpeedMultiplier: 0.7,
        brightness: 1.0,
      },
    ]

    // Calculate icon count based on density
    const densityMultipliers = {
      low: 0.6,
      medium: 1.0,
      high: 1.4,
    }
    const baseCount = minCount + (maxCount - minCount) * densityMultipliers[density]
    const iconCount = Math.floor(Math.max(minCount, Math.min(maxCount, baseCount)))

    // Color schemes based on variant
    const colorSchemes = {
      dark: [
        'text-blue-400',
        'text-cyan-400',
        'text-purple-400',
        'text-indigo-400',
        'text-teal-400',
        'text-blue-300',
        'text-purple-300',
        'text-cyan-300',
      ],
      light: [
        'text-slate-800',
        'text-gray-800',
        'text-zinc-800',
        'text-blue-800',
        'text-cyan-800',
        'text-purple-800',
        'text-indigo-800',
        'text-slate-900',
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
    }

    const colors = colorSchemes[variant]

    // Distribute icons across depth layers (background to foreground)
    let currentIconIndex = 0

    depthLayersWithSize.forEach((layer) => {
      const layerIconCount = Math.floor(iconCount * layer.frequency)

      for (let i = 0; i < layerIconCount && currentIconIndex < iconCount; i++) {
        currentIconIndex++

        // Select icon from weighted pool
        const selectedIcon = iconPool[Math.floor(Math.random() * iconPool.length)]
        const size = Math.random() * (layer.sizeRange[1] - layer.sizeRange[0]) + layer.sizeRange[0]
        const x = Math.random() * 100 // Random x position (%)
        const y = Math.random() * 100 // Random y position (%)
        const animationDelay = Math.random() * 20 // Random animation delay
        const baseAnimationDuration = 15 + Math.random() * 10 // Base duration 15-25s
        const animationDuration = baseAnimationDuration * layer.animationSpeedMultiplier
        const color = colors[Math.floor(Math.random() * colors.length)]

        // Calculate opacity based on layer and icon category
        const categoryMultiplier = selectedIcon.category === 'popular' ? 1.2 :
          selectedIcon.category === 'moderate' ? 1.0 : 0.8
        const variantMultiplier = variant === 'light' ? 1.0 : 1.0 // Keep full opacity for light variant visibility
        const finalOpacity = opacity * layer.opacityMultiplier * categoryMultiplier * variantMultiplier

        // Apply depth-based visual effects
        const blur = layer.blur
        const brightness = layer.brightness

        // Add slight perspective scaling based on position (further objects slightly smaller towards edges)
        const perspectiveScale = layer.name === 'background' ?
          1 - (Math.abs(x - 50) + Math.abs(y - 50)) * 0.001 : 1

        const finalSize = size * perspectiveScale

        elements.push(
          <div
            key={`${layer.name}-${i}`}
            className={`absolute ${color} transition-all duration-1000`}
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
              filter: blur > 0 ? `blur(${blur}px)` : 'none',
              transform: layer.name === 'background' ? 'scale(0.98)' : 'scale(1)', // Slight scale for depth
            }}
          >
            <Image
              src={selectedIcon.icon}
              alt={selectedIcon.name}
              width={Math.round(finalSize)}
              height={Math.round(finalSize)}
              className="h-full w-full object-contain"
              style={{
                filter:
                  variant === 'light'
                    ? `invert(1) brightness(${brightness * 0.7}) contrast(1.5) sepia(0.3) saturate(1.1)`
                    : `brightness(${brightness}) sepia(${0.3 * brightness}) saturate(${1.3 * brightness})`,
              }}
            />
          </div>,
        )
      }
    })

    return elements
  }, [minCount, maxCount, density, variant, opacity, animated, minSize, maxSize])

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {/* Deep background gradient for atmospheric depth */}
      <div
        className={`absolute inset-0 ${variant === 'light'
          ? 'bg-gradient-to-r from-blue-50/5 via-purple-50/8 to-cyan-50/5'
          : 'bg-gradient-to-r from-blue-900/5 via-purple-900/8 to-cyan-900/5'
          }`}
      />

      {/* Mid-depth atmospheric layer */}
      <div
        className={`absolute inset-0 ${variant === 'light'
          ? 'bg-gradient-to-br from-cyan-50/6 via-transparent to-indigo-50/6'
          : 'bg-gradient-to-br from-cyan-900/6 via-transparent to-indigo-900/6'
          }`}
      />

      {/* Cloud Native Icons with proper depth layering */}
      <div className="absolute inset-0" style={{ perspective: '1000px' }}>
        {iconElements}
      </div>

      {/* Foreground atmospheric enhancement */}
      <div
        className={`absolute inset-0 pointer-events-none ${variant === 'light'
          ? 'bg-gradient-to-t from-transparent via-transparent to-blue-50/3'
          : 'bg-gradient-to-t from-transparent via-transparent to-blue-900/3'
          }`}
      />
    </div>
  )
}
