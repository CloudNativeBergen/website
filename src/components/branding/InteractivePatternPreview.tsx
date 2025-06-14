'use client'

import { useState } from 'react'
import { CloudNativePattern } from '@/components/CloudNativePattern'

export function InteractivePatternPreview() {
  const [opacity, setOpacity] = useState(0.15)
  const [animated, setAnimated] = useState(true)
  const [variant, setVariant] = useState<'dark' | 'light' | 'brand'>('brand')
  const [density, setDensity] = useState<'low' | 'medium' | 'high'>('medium')
  const [minSize, setMinSize] = useState(20)
  const [maxSize, setMaxSize] = useState(60)
  const [minCount, setMinCount] = useState(30)
  const [maxCount, setMaxCount] = useState(80)

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
          density={density}
          minSize={minSize}
          maxSize={maxSize}
          minCount={minCount}
          maxCount={maxCount}
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
              Opacity: {opacity.toFixed(2)} • Size: {minSize}-{maxSize}px •
              Count: {minCount}-{maxCount} • {density} density
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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

          {/* Density Selector */}
          <div>
            <label className="font-space-grotesk mb-2 block text-sm font-semibold text-brand-slate-gray">
              Density
            </label>
            <select
              value={density}
              onChange={(e) =>
                setDensity(e.target.value as 'low' | 'medium' | 'high')
              }
              className="w-full rounded-lg border border-brand-frosted-steel bg-white px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-brand-cloud-blue"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
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

        {/* Sliders */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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

          {/* Size Range */}
          <div>
            <label className="font-space-grotesk mb-2 block text-sm font-semibold text-brand-slate-gray">
              Size Range: {minSize}px - {maxSize}px
            </label>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-brand-slate-gray">
                  Min Size: {minSize}px
                </label>
                <input
                  type="range"
                  min="15"
                  max="50"
                  step="1"
                  value={minSize}
                  onChange={(e) => {
                    const newMin = parseInt(e.target.value)
                    setMinSize(newMin)
                    if (newMin >= maxSize) setMaxSize(newMin + 10)
                  }}
                  className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-brand-frosted-steel"
                />
              </div>
              <div>
                <label className="text-xs text-brand-slate-gray">
                  Max Size: {maxSize}px
                </label>
                <input
                  type="range"
                  min="30"
                  max="100"
                  step="1"
                  value={maxSize}
                  onChange={(e) => {
                    const newMax = parseInt(e.target.value)
                    setMaxSize(newMax)
                    if (newMax <= minSize) setMinSize(newMax - 10)
                  }}
                  className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-brand-frosted-steel"
                />
              </div>
            </div>
          </div>

          {/* Count Range */}
          <div>
            <label className="font-space-grotesk mb-2 block text-sm font-semibold text-brand-slate-gray">
              Count Range: {minCount} - {maxCount}
            </label>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-brand-slate-gray">
                  Min Count: {minCount}
                </label>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="1"
                  value={minCount}
                  onChange={(e) => {
                    const newMin = parseInt(e.target.value)
                    setMinCount(newMin)
                    if (newMin >= maxCount) setMaxCount(newMin + 20)
                  }}
                  className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-brand-frosted-steel"
                />
              </div>
              <div>
                <label className="text-xs text-brand-slate-gray">
                  Max Count: {maxCount}
                </label>
                <input
                  type="range"
                  min="40"
                  max="150"
                  step="1"
                  value={maxCount}
                  onChange={(e) => {
                    const newMax = parseInt(e.target.value)
                    setMaxCount(newMax)
                    if (newMax <= minCount) setMinCount(newMax - 20)
                  }}
                  className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-brand-frosted-steel"
                />
              </div>
            </div>
          </div>

          {/* Current Settings Display */}
          <div className="rounded-lg bg-white p-4">
            <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
              Current Configuration
            </h5>
            <div className="space-y-1 font-mono text-xs text-brand-slate-gray">
              <div>opacity={opacity}</div>
              <div>variant=&quot;{variant}&quot;</div>
              <div>density=&quot;{density}&quot;</div>
              <div>animated={animated.toString()}</div>
              <div>minSize={minSize}</div>
              <div>maxSize={maxSize}</div>
              <div>minCount={minCount}</div>
              <div>maxCount={maxCount}</div>
            </div>
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
                setDensity('low')
                setMinSize(15)
                setMaxSize(35)
                setMinCount(20)
                setMaxCount(40)
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
                setDensity('medium')
                setMinSize(30)
                setMaxSize(75)
                setMinCount(35)
                setMaxCount(70)
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
                setDensity('high')
                setMinSize(20)
                setMaxSize(80)
                setMinCount(50)
                setMaxCount(120)
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
                setDensity('low')
                setMinSize(18)
                setMaxSize(28)
                setMinCount(15)
                setMaxCount(30)
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
  )
}
