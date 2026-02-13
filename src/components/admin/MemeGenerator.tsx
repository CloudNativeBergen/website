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
  QrCodeIcon,
} from '@heroicons/react/24/outline'
import { ConferenceLogo } from '../ConferenceLogo'
import { Logo } from '../Logo'
import type { ConferenceLogos } from '../common/DashboardLayout'
import QRCodeStyling from 'qr-code-styling'
import {
  CANVAS_SIZE,
  DEFAULT_BG_COLOR,
  BRAND_COLORS,
  TEXT_COLOR_PRESETS,
  FONT_FAMILIES,
  DEFAULT_TEXT_LINES,
  LOGO_SIZE_MIN,
  LOGO_SIZE_MAX,
  LOGO_SIZE_DEFAULT,
  LOGO_PADDING_DEFAULT,
  TEXT_PADDING_MIN,
  TEXT_PADDING_MAX,
  QR_SIZE_MIN,
  QR_SIZE_MAX,
  QR_SIZE_DEFAULT,
  QR_VERTICAL_POSITION_DEFAULT,
  QR_HORIZONTAL_POSITION_DEFAULT,
  QR_DOTS_COLOR_DEFAULT,
  QR_BACKGROUND_COLOR_DEFAULT,
  QR_DOT_TYPES,
  QR_CORNER_SQUARE_TYPES,
  QR_CORNER_DOT_TYPES,
  styles,
  type TextLine,
} from './meme-generator-config'

interface MemeGeneratorProps {
  conferenceLogos?: ConferenceLogos
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

export function MemeGenerator({
  conferenceLogos,
  wrapPreview,
}: MemeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const exportCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const qrImageRef = useRef<HTMLImageElement | null>(null)

  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BG_COLOR)
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null)
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(
    null,
  )
  const [textLines, setTextLines] = useState<TextLine[]>(DEFAULT_TEXT_LINES)
  const [logoSize, setLogoSize] = useState(LOGO_SIZE_DEFAULT)
  const [logoVerticalPosition, setLogoVerticalPosition] =
    useState(LOGO_PADDING_DEFAULT)
  const [logoHorizontalPosition, setLogoHorizontalPosition] =
    useState(LOGO_PADDING_DEFAULT)
  const [logoVariant, setLogoVariant] = useState<'gradient' | 'monochrome'>(
    'monochrome',
  )
  const [expandedSections, setExpandedSections] = useState<boolean[]>([
    true,
    true,
    false,
  ])
  const [showBackgroundAdvanced, setShowBackgroundAdvanced] = useState(false)
  const [showTextAdvanced, setShowTextAdvanced] = useState<boolean[]>([
    false,
    false,
    false,
  ])
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null)
  const [qrSize, setQrSize] = useState(QR_SIZE_DEFAULT)
  const [qrVerticalPosition, setQrVerticalPosition] = useState(
    QR_VERTICAL_POSITION_DEFAULT,
  )
  const [qrHorizontalPosition, setQrHorizontalPosition] = useState(
    QR_HORIZONTAL_POSITION_DEFAULT,
  )
  const [showQrAdvanced, setShowQrAdvanced] = useState(false)
  const [qrDotsColor, setQrDotsColor] = useState(QR_DOTS_COLOR_DEFAULT)
  const [qrDotsType, setQrDotsType] = useState<string>('dots')
  const [qrCornerSquareType, setQrCornerSquareType] =
    useState<string>('rounded')
  const [qrCornerDotType, setQrCornerDotType] = useState<string>('dot')
  const [qrBackgroundColor, setQrBackgroundColor] = useState(
    QR_BACKGROUND_COLOR_DEFAULT,
  )

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

  const toggleTextAdvanced = (index: number) => {
    setShowTextAdvanced((prev) => {
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
        ctx.textAlign = line.textAlign
        ctx.textBaseline = 'middle'

        const displayText = line.isUppercase
          ? line.text.toUpperCase()
          : line.text
        const padding = (line.textPadding / 100) * CANVAS_SIZE
        const maxWidth = CANVAS_SIZE - padding * 2

        const words = displayText.split(' ')
        const lines: string[] = []
        let currentLine = ''

        words.forEach((word) => {
          const testLine = currentLine ? `${currentLine} ${word}` : word
          const metrics = ctx.measureText(testLine)

          if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine)
            currentLine = word
          } else {
            currentLine = testLine
          }
        })

        if (currentLine) {
          lines.push(currentLine)
        }

        const lineHeight = line.fontSize * 1.2
        const totalHeight = lines.length * lineHeight
        const startY =
          (line.verticalPosition / 100) * CANVAS_SIZE -
          totalHeight / 2 +
          lineHeight / 2

        lines.forEach((textLine, index) => {
          let x: number
          if (line.textAlign === 'left') {
            x = padding
          } else if (line.textAlign === 'right') {
            x = CANVAS_SIZE - padding
          } else {
            x = CANVAS_SIZE / 2
          }
          const y = startY + index * lineHeight

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
          ctx.lineWidth = 2
          ctx.strokeText(textLine, x, y)
          ctx.fillText(textLine, x, y)
        })
      })

      if (qrImageRef.current && qrCodeImage) {
        const centerX = (qrHorizontalPosition / 100) * CANVAS_SIZE
        const centerY = (qrVerticalPosition / 100) * CANVAS_SIZE
        const x = centerX - qrSize / 2
        const y = centerY - qrSize / 2
        ctx.drawImage(qrImageRef.current, x, y, qrSize, qrSize)
      }
    },
    [
      backgroundColor,
      backgroundImageUrl,
      textLines,
      qrCodeImage,
      qrSize,
      qrVerticalPosition,
      qrHorizontalPosition,
    ],
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
    if (qrCodeUrl) {
      const qrCode = new QRCodeStyling({
        width: qrSize * 2,
        height: qrSize * 2,
        type: 'canvas',
        data: qrCodeUrl,
        dotsOptions: {
          color: qrDotsColor,
          type: qrDotsType as
            | 'rounded'
            | 'dots'
            | 'classy'
            | 'classy-rounded'
            | 'square'
            | 'extra-rounded',
        },
        backgroundOptions: {
          color: qrBackgroundColor,
        },
        cornersSquareOptions: {
          type: qrCornerSquareType as 'dot' | 'square' | 'extra-rounded',
        },
        cornersDotOptions: {
          type: qrCornerDotType as 'dot' | 'square',
        },
        qrOptions: {
          errorCorrectionLevel: 'M',
        },
      })

      qrCode.getRawData('png').then((blob) => {
        if (blob && blob instanceof Blob) {
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            setQrCodeImage(dataUrl)
            const img = new window.Image()
            img.onload = () => {
              qrImageRef.current = img
              draw()
            }
            img.src = dataUrl
          }
          reader.readAsDataURL(blob)
        }
      })
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional cleanup on qr clear
      setQrCodeImage(null)
      qrImageRef.current = null
    }
  }, [
    qrCodeUrl,
    qrSize,
    qrDotsColor,
    qrDotsType,
    qrCornerSquareType,
    qrCornerDotType,
    qrBackgroundColor,
    draw,
  ])

  useEffect(() => {
    const maxPosition = CANVAS_SIZE - logoSize
    if (logoVerticalPosition > maxPosition) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Bounds constraint enforcement
      setLogoVerticalPosition(maxPosition)
    }
    if (logoHorizontalPosition > maxPosition) {
      setLogoHorizontalPosition(maxPosition)
    }
  }, [logoSize, logoVerticalPosition, logoHorizontalPosition])

  const logoStyle =
    logoVariant === 'monochrome' ? { color: getMonochromeColor() } : undefined

  const logoAspectRatio = 970 / 234
  const logoHeight = (size: number) => size / logoAspectRatio

  // Check if conference has custom logos
  const hasCustomLogo = Boolean(conferenceLogos?.logoBright)

  const renderLogo = (scale: number = 1) => (
    <div
      className="pointer-events-none absolute"
      style={{
        bottom: `${logoVerticalPosition * scale}px`,
        right: `${logoHorizontalPosition * scale}px`,
        width: `${logoSize * scale}px`,
        height: `${logoHeight(logoSize) * scale}px`,
        margin: 0,
        padding: 0,
      }}
    >
      {hasCustomLogo ? (
        <ConferenceLogo
          conference={conferenceLogos}
          variant="horizontal"
          className="h-full w-full"
          style={logoStyle}
        />
      ) : (
        <Logo
          variant={logoVariant}
          className="h-full w-full"
          style={logoStyle}
        />
      )}
    </div>
  )

  const previewNode = (
    <div
      className="relative mx-auto h-[540px] w-[540px] max-w-full overflow-hidden rounded-lg shadow-lg"
      style={{ padding: 0, margin: 'auto' }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="block h-full w-full"
        style={{ margin: 0, padding: 0, display: 'block' }}
      />
      {renderLogo(0.5)}
    </div>
  )

  const exportNode = wrapPreview && (
    <div className="hidden">
      {wrapPreview(
        <div
          className="relative h-[1080px] w-[1080px]"
          style={{ padding: 0, margin: 0 }}
        >
          <canvas
            ref={exportCanvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="h-full w-full"
            style={{ margin: 0, padding: 0, display: 'block' }}
          />
          {renderLogo(1)}
        </div>,
      )}
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {wrapPreview ? wrapPreview(previewNode) : previewNode}
        {exportNode}
      </div>

      <div className="space-y-3">
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

            <button
              onClick={() => setShowBackgroundAdvanced(!showBackgroundAdvanced)}
              className="flex w-full items-center justify-between text-sm text-brand-slate-gray hover:text-brand-cloud-blue dark:text-gray-400 dark:hover:text-blue-400"
            >
              <span>Advanced Options</span>
              {showBackgroundAdvanced ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>

            {showBackgroundAdvanced && (
              <div className="space-y-4 pt-2">
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
              </div>
            )}

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

            {showBackgroundAdvanced && (
              <div className="space-y-4">
                <Slider
                  id="logoSize"
                  label="Logo Size"
                  value={logoSize}
                  onChange={setLogoSize}
                  min={LOGO_SIZE_MIN}
                  max={LOGO_SIZE_MAX}
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
            )}
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
                  <label htmlFor={`text-${index}`} className="sr-only">
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

                <button
                  onClick={() => toggleTextAdvanced(index)}
                  className="flex w-full items-center justify-between text-sm text-brand-slate-gray hover:text-brand-cloud-blue dark:text-gray-400 dark:hover:text-blue-400"
                >
                  <span>Advanced Options</span>
                  {showTextAdvanced[index] ? (
                    <ChevronUpIcon className="h-4 w-4" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4" />
                  )}
                </button>

                {showTextAdvanced[index] && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className={styles.label}>Text Alignment</label>
                      <div className="flex gap-2">
                        <ToggleButton
                          active={line.textAlign === 'left'}
                          onClick={() =>
                            updateTextLine(index, 'textAlign', 'left')
                          }
                        >
                          Left
                        </ToggleButton>
                        <ToggleButton
                          active={line.textAlign === 'center'}
                          onClick={() =>
                            updateTextLine(index, 'textAlign', 'center')
                          }
                        >
                          Center
                        </ToggleButton>
                        <ToggleButton
                          active={line.textAlign === 'right'}
                          onClick={() =>
                            updateTextLine(index, 'textAlign', 'right')
                          }
                        >
                          Right
                        </ToggleButton>
                      </div>
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

                    {line.textAlign !== 'center' && (
                      <Slider
                        id={`horizontal-${index}`}
                        label={
                          line.textAlign === 'left'
                            ? 'Distance from Left'
                            : 'Distance from Right'
                        }
                        value={line.horizontalPosition}
                        onChange={(value) =>
                          updateTextLine(index, 'horizontalPosition', value)
                        }
                        min={0}
                        max={100}
                        icon={AdjustmentsHorizontalIcon}
                        suffix="%"
                      />
                    )}

                    <Slider
                      id={`fontSize-${index}`}
                      label="Font Size"
                      value={line.fontSize}
                      onChange={(value) =>
                        updateTextLine(index, 'fontSize', value)
                      }
                      min={16}
                      max={140}
                      icon={ArrowsPointingOutIcon}
                      suffix="px"
                    />

                    <Slider
                      id={`textPadding-${index}`}
                      label="Text Padding (Left & Right)"
                      value={line.textPadding}
                      onChange={(value) =>
                        updateTextLine(index, 'textPadding', value)
                      }
                      min={TEXT_PADDING_MIN}
                      max={TEXT_PADDING_MAX}
                      icon={AdjustmentsHorizontalIcon}
                      suffix="%"
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
                        <label
                          htmlFor={`color-${index}`}
                          className={styles.label}
                        >
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
                          <label
                            htmlFor={`color-${index}`}
                            className="cursor-pointer"
                          >
                            <div
                              className="h-8 w-8 rounded-md border-2 border-gray-300 shadow-sm transition-colors hover:border-brand-cloud-blue dark:border-gray-600 dark:hover:border-blue-400"
                              style={{
                                background:
                                  'linear-gradient(135deg, #ff0000 0%, #ff7f00 16.67%, #ffff00 33.33%, #00ff00 50%, #0000ff 66.67%, #4b0082 83.33%, #9400d3 100%)',
                              }}
                              title="Custom Color"
                            />
                            <input
                              type="color"
                              id={`color-${index}`}
                              value={line.color}
                              onChange={(e) =>
                                updateTextLine(index, 'color', e.target.value)
                              }
                              className="sr-only"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="flex items-end gap-4 pb-2">
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
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`uppercase-${index}`}
                            checked={line.isUppercase}
                            onChange={(e) =>
                              updateTextLine(
                                index,
                                'isUppercase',
                                e.target.checked,
                              )
                            }
                            className="h-4 w-4 rounded border-brand-frosted-steel bg-brand-glacier-white text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-700 dark:text-blue-400 dark:focus:ring-blue-500"
                          />
                          <label
                            htmlFor={`uppercase-${index}`}
                            className="ml-2 text-sm font-medium text-brand-slate-gray dark:text-gray-300"
                          >
                            Uppercase
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* QR Code Section */}
        <div className={styles.panel}>
          <div className="mb-4 flex items-center gap-2">
            <QrCodeIcon className="h-5 w-5 text-brand-slate-gray dark:text-gray-300" />
            <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
              QR Code
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="qr-url" className="sr-only">
                URL
              </label>
              <input
                type="url"
                id="qr-url"
                value={qrCodeUrl}
                onChange={(e) => setQrCodeUrl(e.target.value)}
                placeholder="https://example.com"
                className={styles.input}
              />
            </div>

            <button
              onClick={() => setShowQrAdvanced(!showQrAdvanced)}
              className="flex w-full items-center justify-between text-sm text-brand-slate-gray hover:text-brand-cloud-blue dark:text-gray-400 dark:hover:text-blue-400"
            >
              <span>Advanced Options</span>
              {showQrAdvanced ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>

            {showQrAdvanced && (
              <div className="space-y-4 pt-2">
                <div>
                  <label htmlFor="qr-dots-color" className={styles.label}>
                    Dots Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="qr-dots-color"
                      value={qrDotsColor}
                      onChange={(e) => setQrDotsColor(e.target.value)}
                      className="h-10 w-20 cursor-pointer rounded border border-brand-frosted-steel dark:border-gray-600"
                    />
                    <input
                      type="text"
                      value={qrDotsColor}
                      onChange={(e) => setQrDotsColor(e.target.value)}
                      className="flex-1 rounded border border-brand-frosted-steel bg-brand-glacier-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                      placeholder="#000000"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="qr-bg-color" className={styles.label}>
                    Background Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="qr-bg-color"
                      value={qrBackgroundColor}
                      onChange={(e) => setQrBackgroundColor(e.target.value)}
                      className="h-10 w-20 cursor-pointer rounded border border-brand-frosted-steel dark:border-gray-600"
                    />
                    <input
                      type="text"
                      value={qrBackgroundColor}
                      onChange={(e) => setQrBackgroundColor(e.target.value)}
                      className="flex-1 rounded border border-brand-frosted-steel bg-brand-glacier-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                      placeholder="#FFFFFF"
                    />
                  </div>
                </div>

                <div>
                  <label className={styles.label}>Dots Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    {QR_DOT_TYPES.map((type) => (
                      <ToggleButton
                        key={type.value}
                        active={qrDotsType === type.value}
                        onClick={() => setQrDotsType(type.value)}
                      >
                        {type.name}
                      </ToggleButton>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={styles.label}>Corner Square Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    {QR_CORNER_SQUARE_TYPES.map((type) => (
                      <ToggleButton
                        key={type.value}
                        active={qrCornerSquareType === type.value}
                        onClick={() => setQrCornerSquareType(type.value)}
                      >
                        {type.name}
                      </ToggleButton>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={styles.label}>Corner Dot Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    {QR_CORNER_DOT_TYPES.map((type) => (
                      <ToggleButton
                        key={type.value}
                        active={qrCornerDotType === type.value}
                        onClick={() => setQrCornerDotType(type.value)}
                      >
                        {type.name}
                      </ToggleButton>
                    ))}
                  </div>
                </div>

                <Slider
                  id="qr-size"
                  label="QR Code Size"
                  value={qrSize}
                  onChange={setQrSize}
                  min={QR_SIZE_MIN}
                  max={QR_SIZE_MAX}
                  suffix="px"
                />
                <Slider
                  id="qr-vertical"
                  label="Vertical Position"
                  value={qrVerticalPosition}
                  onChange={setQrVerticalPosition}
                  min={0}
                  max={100}
                  suffix="%"
                />
                <Slider
                  id="qr-horizontal"
                  label="Horizontal Position"
                  value={qrHorizontalPosition}
                  onChange={setQrHorizontalPosition}
                  min={0}
                  max={100}
                  suffix="%"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
