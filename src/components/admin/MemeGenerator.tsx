'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  PhotoIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AdjustmentsHorizontalIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline'
import { Logo } from '../Logo'
import {
  CANVAS_SIZE,
  DEFAULT_BG_COLOR,
  BRAND_COLORS,
  TEXT_COLOR_PRESETS,
  FONT_FAMILIES,
  DEFAULT_TEXT_LINES,
  styles,
  type TextLine,
} from './meme-generator-config'

interface MemeGeneratorProps {
  wrapPreview?: (node: React.ReactNode) => React.ReactNode
}

interface ColorButtonProps {
  color: { name: string; value: string }
  onClick: () => void
  isActive?: boolean
  size?: 'small' | 'large'
}

interface SliderProps {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  suffix?: string
  icon?: React.ElementType
}

const ColorButton = ({
  color,
  onClick,
  isActive,
  size = 'large',
}: ColorButtonProps) => {
  if (size === 'small') {
    return (
      <button
        onClick={onClick}
        className="h-8 w-8 rounded-md border-2 border-gray-300 shadow-sm transition-colors hover:border-brand-cloud-blue dark:border-gray-600 dark:hover:border-blue-400"
        style={{ backgroundColor: color.value }}
        title={color.name}
        aria-label={`Set color to ${color.name}`}
      />
    )
  }

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-all ${
        isActive
          ? 'border-brand-cloud-blue shadow-md dark:border-blue-400'
          : 'border-brand-frosted-steel hover:border-brand-cloud-blue/50 dark:border-gray-600 dark:hover:border-blue-500/50'
      }`}
      title={color.name}
    >
      <div
        className="h-12 w-12 rounded-md border border-gray-300 shadow-sm dark:border-gray-600"
        style={{ backgroundColor: color.value }}
      />
      <span className="text-xs font-medium text-brand-slate-gray dark:text-gray-300">
        {color.name}
      </span>
      {isActive && (
        <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-brand-cloud-blue dark:bg-blue-400" />
      )}
    </button>
  )
}

const Slider = ({
  id,
  label,
  value,
  onChange,
  min,
  max,
  suffix = '',
  icon: Icon,
}: SliderProps) => (
  <div>
    <label htmlFor={id} className={styles.label}>
      {Icon && <Icon className="mr-1 inline h-4 w-4" />}
      {label}: {Math.round(value)}
      {suffix}
    </label>
    <input
      type="range"
      id={id}
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="slider w-full"
    />
  </div>
)

const ToggleButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    onClick={onClick}
    className={`flex-1 rounded-lg border px-3 py-2 transition-colors ${
      active ? styles.buttonActive : styles.buttonInactive
    }`}
    aria-pressed={active}
  >
    {children}
  </button>
)

export function MemeGenerator({ wrapPreview }: MemeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const exportCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BG_COLOR)
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null)
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(
    null,
  )
  const [textLines, setTextLines] = useState<TextLine[]>(DEFAULT_TEXT_LINES)
  const [logoSize, setLogoSize] = useState(120)
  const [logoVerticalPosition, setLogoVerticalPosition] = useState(20)
  const [logoHorizontalPosition, setLogoHorizontalPosition] = useState(40)
  const [logoVariant, setLogoVariant] = useState<'gradient' | 'monochrome'>(
    'gradient',
  )
  const [expandedSections, setExpandedSections] = useState<boolean[]>([
    true,
    false,
    false,
  ])

  const getMonochromeColor = useCallback(() => {
    if (backgroundImageUrl) return '#FFFFFF'
    const hex = backgroundColor.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16) / 255
    const g = parseInt(hex.substring(2, 4), 16) / 255
    const b = parseInt(hex.substring(4, 6), 16) / 255
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance > 0.5 ? '#000000' : '#FFFFFF'
  }, [backgroundColor, backgroundImageUrl])

  const handleBackgroundImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setBackgroundImage(file)
      const reader = new FileReader()
      reader.onload = (event) => {
        const url = event.target?.result as string
        setBackgroundImageUrl(url)
        const img = new window.Image()
        img.onload = () => {
          imageRef.current = img
        }
        img.src = url
      }
      reader.readAsDataURL(file)
    }
  }

  const updateTextLine = (
    index: number,
    property: keyof TextLine,
    value: string | number | boolean,
  ) => {
    setTextLines((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [property]: value }
      return updated
    })
  }

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const updated = [...prev]
      updated[index] = !updated[index]
      return updated
    })
  }

  const drawCanvas = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

      if (imageRef.current && backgroundImageUrl) {
        const img = imageRef.current
        const hRatio = CANVAS_SIZE / img.width
        const vRatio = CANVAS_SIZE / img.height
        const ratio = Math.max(hRatio, vRatio)
        const centerShiftX = (CANVAS_SIZE - img.width * ratio) / 2
        const centerShiftY = (CANVAS_SIZE - img.height * ratio) / 2

        ctx.drawImage(
          img,
          0,
          0,
          img.width,
          img.height,
          centerShiftX,
          centerShiftY,
          img.width * ratio,
          img.height * ratio,
        )
      } else {
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      }

      textLines.forEach((line) => {
        if (!line.text) return

        const weight = line.isBold ? 'bold' : 'normal'
        ctx.font = `${weight} ${line.fontSize}px "${line.fontFamily}", sans-serif`
        ctx.fillStyle = line.color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
        ctx.shadowBlur = 4
        ctx.shadowOffsetX = 2
        ctx.shadowOffsetY = 2

        const x = CANVAS_SIZE / 2
        const y = (line.verticalPosition / 100) * CANVAS_SIZE
        ctx.fillText(line.text, x, y)

        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
      })
    },
    [backgroundColor, backgroundImageUrl, textLines],
  )

  const draw = useCallback(() => {
    ;[canvasRef.current, exportCanvasRef.current]
      .filter(Boolean)
      .forEach((canvas) => {
        const ctx = canvas?.getContext('2d')
        if (ctx) drawCanvas(ctx)
      })
  }, [drawCanvas])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const maxPosition = CANVAS_SIZE - logoSize
    if (logoVerticalPosition > maxPosition) {
      setLogoVerticalPosition(maxPosition)
    }
    if (logoHorizontalPosition > maxPosition) {
      setLogoHorizontalPosition(maxPosition)
    }
  }, [logoSize, logoVerticalPosition, logoHorizontalPosition])

  const logoStyle =
    logoVariant === 'monochrome' ? { color: getMonochromeColor() } : undefined

  const renderLogo = (scale: number = 1) => (
    <div
      className="absolute"
      style={{
        bottom: `${logoVerticalPosition * scale}px`,
        right: `${logoHorizontalPosition * scale}px`,
        width: `${logoSize * scale}px`,
        height: `${logoSize * scale}px`,
      }}
    >
      <Logo variant={logoVariant} className="h-full w-full" style={logoStyle} />
    </div>
  )

  const previewNode = (
    <div className="relative mx-auto h-[540px] w-[540px] max-w-full overflow-hidden rounded-lg shadow-lg">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="h-full w-full"
      />
      {renderLogo(0.5)}
    </div>
  )

  const exportNode = wrapPreview && (
    <div className="hidden">
      {wrapPreview(
        <div className="relative h-[1080px] w-[1080px]">
          <canvas
            ref={exportCanvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="h-full w-full"
          />
          {renderLogo(1)}
        </div>,
      )}
    </div>
  )

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
          Preview
        </h3>
        {wrapPreview ? wrapPreview(previewNode) : previewNode}
        {exportNode}
      </div>

      <div className="space-y-6">
        <div className={styles.panel}>
          <div className="mb-4 flex items-center gap-2">
            <PhotoIcon className="h-5 w-5 text-brand-slate-gray dark:text-gray-300" />
            <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
              Background & Logo
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className={styles.label}>Color Presets</label>
              <div className="mb-4 grid grid-cols-4 gap-2">
                {BRAND_COLORS.map((color) => (
                  <ColorButton
                    key={color.value}
                    color={color}
                    isActive={backgroundColor === color.value}
                    onClick={() => setBackgroundColor(color.value)}
                  />
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="backgroundColor" className={styles.label}>
                Custom Color
              </label>
              <input
                type="color"
                id="backgroundColor"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="h-10 w-full cursor-pointer rounded border border-brand-frosted-steel dark:border-gray-600"
              />
            </div>

            <div>
              <label htmlFor="backgroundImage" className={styles.label}>
                <ArrowUpTrayIcon className="mr-1 inline h-4 w-4" />
                Upload Background Image
              </label>
              <input
                type="file"
                id="backgroundImage"
                accept="image/*"
                onChange={handleBackgroundImageUpload}
                className="w-full text-sm text-brand-slate-gray file:mr-4 file:rounded file:border-0 file:bg-brand-cloud-blue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-cloud-blue/90 dark:text-gray-300 dark:file:bg-blue-600 dark:hover:file:bg-blue-700"
              />
            </div>

            {backgroundImage && (
              <div className="flex items-center gap-4">
                <p className="flex-1 text-sm text-brand-slate-gray dark:text-gray-300">
                  Current: {backgroundImage.name}
                </p>
                <button
                  onClick={() => {
                    setBackgroundImage(null)
                    setBackgroundImageUrl(null)
                    imageRef.current = null
                  }}
                  className="flex items-center gap-2 rounded bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                  aria-label="Clear background image"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Clear
                </button>
              </div>
            )}

            <Slider
              id="logoSize"
              label="Logo Size"
              value={logoSize}
              onChange={setLogoSize}
              min={60}
              max={300}
              icon={ArrowsPointingOutIcon}
              suffix="px"
            />

            <Slider
              id="logoVerticalPosition"
              label="Logo Distance from Bottom"
              value={logoVerticalPosition}
              onChange={setLogoVerticalPosition}
              min={0}
              max={CANVAS_SIZE - logoSize}
              icon={AdjustmentsHorizontalIcon}
              suffix="px"
            />

            <Slider
              id="logoHorizontalPosition"
              label="Logo Distance from Right"
              value={logoHorizontalPosition}
              onChange={setLogoHorizontalPosition}
              min={0}
              max={CANVAS_SIZE - logoSize}
              icon={AdjustmentsHorizontalIcon}
              suffix="px"
            />

            <div>
              <label className={styles.label}>Logo Style</label>
              <div className="flex gap-3">
                <ToggleButton
                  active={logoVariant === 'gradient'}
                  onClick={() => setLogoVariant('gradient')}
                >
                  Gradient (Color)
                </ToggleButton>
                <ToggleButton
                  active={logoVariant === 'monochrome'}
                  onClick={() => setLogoVariant('monochrome')}
                >
                  Monochrome (B&W)
                </ToggleButton>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Monochrome adapts to light/dark backgrounds automatically
              </p>
            </div>
          </div>
        </div>

        {textLines.map((line, index) => (
          <div key={index} className={styles.panel}>
            <button
              onClick={() => toggleSection(index)}
              className="mb-4 flex w-full items-center justify-between"
              aria-expanded={expandedSections[index]}
            >
              <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                Text Line {index + 1}
              </h3>
              {expandedSections[index] ? (
                <ChevronUpIcon className="h-5 w-5 text-brand-slate-gray dark:text-gray-300" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-brand-slate-gray dark:text-gray-300" />
              )}
            </button>

            {expandedSections[index] && (
              <div className="space-y-4">
                <div>
                  <label htmlFor={`text-${index}`} className={styles.label}>
                    Text Content
                  </label>
                  <input
                    type="text"
                    id={`text-${index}`}
                    value={line.text}
                    onChange={(e) =>
                      updateTextLine(index, 'text', e.target.value)
                    }
                    className={styles.input}
                    placeholder="Enter your text..."
                  />
                </div>

                <Slider
                  id={`position-${index}`}
                  label="Vertical Position"
                  value={line.verticalPosition}
                  onChange={(value) =>
                    updateTextLine(index, 'verticalPosition', value)
                  }
                  min={0}
                  max={100}
                  icon={AdjustmentsHorizontalIcon}
                  suffix="%"
                />

                <Slider
                  id={`fontSize-${index}`}
                  label="Font Size"
                  value={line.fontSize}
                  onChange={(value) => updateTextLine(index, 'fontSize', value)}
                  min={16}
                  max={120}
                  icon={ArrowsPointingOutIcon}
                  suffix="px"
                />

                <div>
                  <label
                    htmlFor={`fontFamily-${index}`}
                    className={styles.label}
                  >
                    Font Family
                  </label>
                  <select
                    id={`fontFamily-${index}`}
                    value={line.fontFamily}
                    onChange={(e) =>
                      updateTextLine(index, 'fontFamily', e.target.value)
                    }
                    className={styles.input}
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label htmlFor={`color-${index}`} className={styles.label}>
                      Text Color
                    </label>
                    <div className="mb-2 flex gap-2">
                      {TEXT_COLOR_PRESETS.map((preset) => (
                        <ColorButton
                          key={preset.value}
                          color={preset}
                          size="small"
                          onClick={() =>
                            updateTextLine(index, 'color', preset.value)
                          }
                        />
                      ))}
                    </div>
                    <input
                      type="color"
                      id={`color-${index}`}
                      value={line.color}
                      onChange={(e) =>
                        updateTextLine(index, 'color', e.target.value)
                      }
                      className="h-10 w-full cursor-pointer rounded border border-brand-frosted-steel dark:border-gray-600"
                    />
                  </div>

                  <div className="flex items-end pb-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id={`bold-${index}`}
                        checked={line.isBold}
                        onChange={(e) =>
                          updateTextLine(index, 'isBold', e.target.checked)
                        }
                        className="h-4 w-4 rounded border-brand-frosted-steel bg-brand-glacier-white text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-700 dark:text-blue-400 dark:focus:ring-blue-500"
                      />
                      <label
                        htmlFor={`bold-${index}`}
                        className="ml-2 text-sm font-medium text-brand-slate-gray dark:text-gray-300"
                      >
                        Bold
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
