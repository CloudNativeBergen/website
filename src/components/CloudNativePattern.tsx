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

// Cloud native project icons from imported SVGs
const cloudNativeIcons = [
  KubernetesIcon,
  HelmIcon,
  PrometheusIcon,
  IstioIcon,
  EnvoyIcon,
  JaegerIcon,
  ArgoIcon,
  BackstageIcon,
  CertManagerIcon,
  CiliumIcon,
  CloudNativePGIcon,
  ContainerdIcon,
  CoreDNSIcon,
  CrossplaneIcon,
  EtcdIcon,
  FalcoIcon,
  GRPCIcon,
  KyvernoIcon,
]

interface CloudNativePatternProps {
  className?: string
  opacity?: number
  animated?: boolean
  variant?: 'dark' | 'light' | 'brand'
  density?: 'low' | 'medium' | 'high'
  minSize?: number
  maxSize?: number
  minCount?: number
  maxCount?: number
}

export function CloudNativePattern({
  className = '',
  opacity = 0.15,
  animated = true,
  variant = 'brand',
  density = 'medium',
  minSize = 30,
  maxSize = 75,
  minCount = 35,
  maxCount = 70,
}: CloudNativePatternProps) {
  // Generate random positions and properties for icons
  const iconElements = useMemo(() => {
    const elements = []

    // Calculate icon count based on density and custom limits
    const densityMultipliers = {
      low: 0.6,
      medium: 1.0,
      high: 1.4,
    }
    const baseCount =
      minCount + (maxCount - minCount) * densityMultipliers[density]
    const iconCount = Math.floor(
      Math.max(minCount, Math.min(maxCount, baseCount)),
    )

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
        'text-blue-600',
        'text-cyan-600',
        'text-purple-600',
        'text-indigo-600',
        'text-teal-600',
        'text-slate-600',
        'text-gray-600',
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

    for (let i = 0; i < iconCount; i++) {
      // Use regular Math.random for truly random generation
      const iconSrc =
        cloudNativeIcons[Math.floor(Math.random() * cloudNativeIcons.length)]
      const size = Math.random() * (maxSize - minSize) + minSize // Random size within specified range
      const x = Math.random() * 100 // Random x position (%)
      const y = Math.random() * 100 // Random y position (%)
      const animationDelay = Math.random() * 20 // Random animation delay
      const animationDuration = 15 + Math.random() * 10 // Random duration 15-25s
      const color = colors[Math.floor(Math.random() * colors.length)]

      // Calculate focus/diffusion based on size
      // Smaller icons = more in focus (higher opacity, more color intensity)
      // Larger icons = more diffuse (lower opacity, less color intensity)
      const sizeRatio = (size - minSize) / (maxSize - minSize) // 0 = smallest, 1 = largest
      const focusOpacity = opacity * (1.5 - sizeRatio * 0.8) // Smaller icons get higher opacity
      const colorIntensity = 1.8 - sizeRatio * 0.6 // Smaller icons get more color intensity
      const blur = sizeRatio * 0.5 // Larger icons get slight blur

      elements.push(
        <div
          key={i}
          className={`absolute ${color} transition-all duration-1000`}
          style={{
            width: `${size.toFixed(4)}px`,
            height: `${size.toFixed(4)}px`,
            left: `${x.toFixed(4)}%`,
            top: `${y.toFixed(4)}%`,
            opacity: parseFloat(Math.min(focusOpacity, 1).toFixed(4)), // Cap at 1, ensure consistent precision
            animation: animated
              ? `float ${animationDuration.toFixed(4)}s ease-in-out infinite ${animationDelay.toFixed(4)}s`
              : 'none',
            filter: `blur(${blur.toFixed(4)}px)`,
          }}
        >
          <Image
            src={iconSrc}
            alt="Cloud Native Icon"
            width={size}
            height={size}
            className="h-full w-full object-contain"
            style={{
              filter:
                variant === 'light'
                  ? `brightness(${(0.6 + colorIntensity * 0.2).toFixed(4)}) sepia(1) saturate(${colorIntensity.toFixed(4)}) hue-rotate(200deg)`
                  : `brightness(${(1.2 + colorIntensity * 0.3).toFixed(4)}) sepia(${(0.3 + colorIntensity * 0.2).toFixed(4)}) saturate(${(1.5 + colorIntensity * 0.3).toFixed(4)})`,
            }}
          />
        </div>,
      )
    }

    return elements
  }, [
    minCount,
    maxCount,
    density,
    variant,
    minSize,
    maxSize,
    opacity,
    animated,
  ])

  const generateIcons = () => iconElements

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {/* Gradient overlay */}
      <div
        className={`absolute inset-0 ${
          variant === 'light'
            ? 'bg-gradient-to-br from-blue-50/20 via-purple-50/20 to-cyan-50/20'
            : 'bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-cyan-900/20'
        }`}
      />

      {/* Cloud Native Icons Pattern */}
      <div className="absolute inset-0">{generateIcons()}</div>

      {/* Additional floating elements with focus/diffusion logic */}
      <div className="absolute inset-0">
        {/* Kubernetes Icon - Featured (large, more diffuse) */}
        <div
          className="absolute"
          style={{
            left: '20%',
            top: '30%',
            width: '64px',
            height: '64px',
            opacity: 0.12, // Lower opacity for larger size
            animation: animated
              ? 'float-slow 40s ease-in-out infinite'
              : 'none',
            filter: 'blur(0.8px)', // Slight blur for diffusion
          }}
        >
          <Image
            src={KubernetesIcon}
            alt="Kubernetes"
            width={64}
            height={64}
            className="h-full w-full object-contain"
            style={{
              filter:
                variant === 'light'
                  ? 'brightness(0.7) sepia(1) saturate(1.5) hue-rotate(200deg)'
                  : 'brightness(1.3) sepia(0.2) saturate(1.2)',
            }}
          />
        </div>

        {/* Prometheus Icon - Monitoring (medium, balanced) */}
        <div
          className="absolute"
          style={{
            left: '70%',
            top: '20%',
            width: '48px',
            height: '48px',
            opacity: 0.16, // Medium opacity
            animation: animated
              ? 'float-drift 35s ease-in-out infinite 5s'
              : 'none',
            filter: 'blur(0.4px)', // Light blur
          }}
        >
          <Image
            src={PrometheusIcon}
            alt="Prometheus"
            width={48}
            height={48}
            className="h-full w-full object-contain"
            style={{
              filter:
                variant === 'light'
                  ? 'brightness(0.75) sepia(1) saturate(1.8) hue-rotate(300deg)'
                  : 'brightness(1.4) sepia(0.3) saturate(1.4)',
            }}
          />
        </div>

        {/* Istio Icon - Service Mesh (small, more in focus) */}
        <div
          className="absolute"
          style={{
            left: '80%',
            top: '60%',
            width: '32px',
            height: '32px',
            opacity: 0.22, // Higher opacity for smaller size
            animation: animated
              ? 'float-gentle 30s ease-in-out infinite 10s'
              : 'none',
            filter: 'blur(0px)', // No blur - sharp and in focus
          }}
        >
          <Image
            src={IstioIcon}
            alt="Istio"
            width={32}
            height={32}
            className="h-full w-full object-contain"
            style={{
              filter:
                variant === 'light'
                  ? 'brightness(0.85) sepia(1) saturate(2.2) hue-rotate(260deg)'
                  : 'brightness(1.6) sepia(0.4) saturate(1.8)',
            }}
          />
        </div>

        {/* Helm Icon - Package Manager (medium-large, slightly diffuse) */}
        <div
          className="absolute"
          style={{
            left: '10%',
            top: '70%',
            width: '56px',
            height: '56px',
            opacity: 0.14, // Lower opacity for larger size
            animation: animated
              ? 'float-drift 45s ease-in-out infinite 15s reverse'
              : 'none',
            filter: 'blur(0.6px)', // Slight blur for diffusion
          }}
        >
          <Image
            src={HelmIcon}
            alt="Helm"
            width={56}
            height={56}
            className="h-full w-full object-contain"
            style={{
              filter:
                variant === 'light'
                  ? 'brightness(0.7) sepia(1) saturate(1.6) hue-rotate(180deg)'
                  : 'brightness(1.25) sepia(0.35) saturate(1.3)',
            }}
          />
        </div>

        {/* Argo Icon - GitOps (smallest, most in focus) */}
        <div
          className="absolute"
          style={{
            left: '50%',
            top: '10%',
            width: '28px',
            height: '28px',
            opacity: 0.25, // Highest opacity for smallest size
            animation: animated
              ? 'float-gentle 25s ease-in-out infinite 8s'
              : 'none',
            filter: 'blur(0px)', // No blur - sharpest focus
          }}
        >
          <Image
            src={ArgoIcon}
            alt="Argo"
            width={28}
            height={28}
            className="h-full w-full object-contain"
            style={{
              filter:
                variant === 'light'
                  ? 'brightness(0.9) sepia(1) saturate(2.5) hue-rotate(340deg)'
                  : 'brightness(1.8) sepia(0.5) saturate(2.0)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
