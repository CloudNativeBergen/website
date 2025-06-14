'use client'

import { useState } from 'react'
import { CloudNativePattern } from '@/components/CloudNativePattern'

export function InteractivePatternPreview() {
  const [opacity, setOpacity] = useState(0.15)
  const [animated, setAnimated] = useState(true)
  const [variant, setVariant] = useState<'dark' | 'light' | 'brand'>('brand')
  const [baseSize, setBaseSize] = useState(45)
  const [iconCount, setIconCount] = useState(50)

  // Calculate size range for display
  const minDisplaySize = Math.round(baseSize * 0.5)
  const maxDisplaySize = Math.round(baseSize * 1.6)

  return (
    <div className="space-y-6">
      <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
        Interactive Pattern Preview
      </h3>

      {/* Pattern Display */}
      <div
        className={`relative h-80 overflow-hidden rounded-xl ${
          variant === 'light'
            ? 'border-2 border-brand-frosted-steel bg-brand-glacier-white'
            : 'bg-brand-gradient'
        }`}
      >
        <CloudNativePattern
          className="z-0"
          opacity={opacity}
          animated={animated}
          variant={variant}
          baseSize={baseSize}
          iconCount={iconCount}
        />
        <div
          className={`absolute inset-0 z-10 ${
            variant === 'light' ? 'bg-black/20' : 'bg-black/40'
          }`}
        ></div>
        <div className="relative z-20 flex h-full items-center justify-center">
          <div className="text-center">
            <h4
              className={`font-jetbrains mb-4 text-2xl font-bold ${
                variant === 'light' ? 'text-brand-slate-gray' : 'text-white'
              }`}
            >
              Cloud Native Elements
            </h4>
            <p
              className={`font-inter max-w-md text-sm ${
                variant === 'light' ? 'text-brand-slate-gray' : 'text-white/90'
              }`}
            >
              Opacity: {opacity.toFixed(2)} • Base Size: {baseSize}px • Range:{' '}
              {minDisplaySize}-{maxDisplaySize}px • {iconCount} icons
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6 rounded-xl bg-brand-sky-mist p-6">
        <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray">
          Pattern Controls
        </h4>

        {/* Basic Controls Row */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Variant Selector */}
          <div>
            <label className="font-space-grotesk mb-2 block text-sm font-semibold text-brand-slate-gray">
              Variant
            </label>
            <select
              value={variant}
              onChange={(e) =>
                setVariant(e.target.value as 'dark' | 'light' | 'brand')
              }
              className="w-full rounded-lg border border-brand-frosted-steel bg-white px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-brand-cloud-blue"
            >
              <option value="brand">Brand</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          {/* Animation Toggle */}
          <div>
            <label className="font-space-grotesk mb-2 block text-sm font-semibold text-brand-slate-gray">
              Animation
            </label>
            <label className="flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={animated}
                onChange={(e) => setAnimated(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`relative h-6 w-12 rounded-full transition-colors ${
                  animated ? 'bg-brand-cloud-blue' : 'bg-brand-frosted-steel'
                }`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    animated ? 'translate-x-6' : 'translate-x-0'
                  }`}
                ></div>
              </div>
              <span className="font-inter ml-3 text-sm text-brand-slate-gray">
                {animated ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>

        {/* Sliders Row */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Opacity Slider */}
          <div>
            <label className="font-space-grotesk mb-2 block text-sm font-semibold text-brand-slate-gray">
              Opacity: {opacity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.05"
              max="0.3"
              step="0.01"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-brand-frosted-steel"
            />
            <div className="mt-1 flex justify-between text-xs text-brand-slate-gray">
              <span>0.05</span>
              <span>0.30</span>
            </div>
          </div>

          {/* Base Size */}
          <div>
            <label className="font-space-grotesk mb-2 block text-sm font-semibold text-brand-slate-gray">
              Base Size: {baseSize}px
            </label>
            <input
              type="range"
              min="20"
              max="100"
              step="1"
              value={baseSize}
              onChange={(e) => setBaseSize(parseInt(e.target.value))}
              className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-brand-frosted-steel"
            />
            <div className="mt-1 flex justify-between text-xs text-brand-slate-gray">
              <span>20px</span>
              <span>100px</span>
            </div>
            <div className="mt-1 text-center text-xs text-brand-slate-gray/70">
              Range: {minDisplaySize}-{maxDisplaySize}px
            </div>
          </div>

          {/* Icon Count */}
          <div>
            <label className="font-space-grotesk mb-2 block text-sm font-semibold text-brand-slate-gray">
              Icon Count: {iconCount}
            </label>
            <input
              type="range"
              min="10"
              max="200"
              step="1"
              value={iconCount}
              onChange={(e) => setIconCount(parseInt(e.target.value))}
              className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-brand-frosted-steel"
            />
            <div className="mt-1 flex justify-between text-xs text-brand-slate-gray">
              <span>10</span>
              <span>200</span>
            </div>
          </div>
        </div>

        {/* Configuration Display and Presets Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Current Settings Display */}
          <div className="rounded-lg bg-white p-4">
            <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
              Current Configuration
            </h5>
            <div className="space-y-1 font-mono text-xs text-brand-slate-gray">
              <div>opacity={opacity}</div>
              <div>variant=&quot;{variant}&quot;</div>
              <div>animated={animated.toString()}</div>
              <div>baseSize={baseSize}</div>
              <div>iconCount={iconCount}</div>
            </div>
          </div>

          {/* Preset Buttons */}
          <div>
            <h5 className="font-space-grotesk mb-3 text-sm font-semibold text-brand-slate-gray">
              Quick Presets
            </h5>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setOpacity(0.08)
                  setVariant('light')
                  setBaseSize(25)
                  setIconCount(18)
                  setAnimated(true)
                }}
                className="font-inter rounded-md border border-brand-frosted-steel bg-white px-3 py-1 text-xs text-brand-slate-gray transition-colors hover:bg-brand-glacier-white"
              >
                Content Background
              </button>
              <button
                onClick={() => {
                  setOpacity(0.15)
                  setVariant('brand')
                  setBaseSize(52)
                  setIconCount(38)
                  setAnimated(true)
                }}
                className="font-inter rounded-md border border-brand-frosted-steel bg-white px-3 py-1 text-xs text-brand-slate-gray transition-colors hover:bg-brand-glacier-white"
              >
                Hero Section
              </button>
              <button
                onClick={() => {
                  setOpacity(0.2)
                  setVariant('dark')
                  setBaseSize(58)
                  setIconCount(55)
                  setAnimated(true)
                }}
                className="font-inter rounded-md border border-brand-frosted-steel bg-white px-3 py-1 text-xs text-brand-slate-gray transition-colors hover:bg-brand-glacier-white"
              >
                Dramatic Background
              </button>
              <button
                onClick={() => {
                  setOpacity(0.06)
                  setVariant('light')
                  setBaseSize(23)
                  setIconCount(22)
                  setAnimated(false)
                }}
                className="font-inter rounded-md border border-brand-frosted-steel bg-white px-3 py-1 text-xs text-brand-slate-gray transition-colors hover:bg-brand-glacier-white"
              >
                Subtle Static
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
