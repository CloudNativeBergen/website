'use client'

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
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
import type { ConferenceLogos } from '../common/DashboardLayout'
import {
  CANVAS_SIZE,
  BRAND_COLORS,
  TEXT_COLOR_PRESETS,
  FONT_FAMILIES,
  LOGO_SIZE_MIN,
  LOGO_SIZE_MAX,
  TEXT_PADDING_MIN,
  TEXT_PADDING_MAX,
  QR_SIZE_MIN,
  QR_SIZE_MAX,
  QR_DOT_TYPES,
  QR_CORNER_SQUARE_TYPES,
  QR_CORNER_DOT_TYPES,
  styles,
  type TextLine,
} from './meme-generator-config'
import {
  canvasFontShorthand,
  fontRequestsForLines,
  loadCanvasFonts,
  memeLineText,
} from './meme-generator-fonts'
import {
  brandGradientColors,
  loadLogoImage,
  logoTint,
  logoRasterKey,
  logoRasterRequests,
  logoSvgFor,
  wordmarkFont,
  wordmarkFontFamily,
  type CanvasLogo,
} from './meme-generator-logo'
import {
  DEFAULT_DESIGN,
  designIsLight,
  drawDesign,
  type MemeDesign,
  type QrStyle,
  type Raster,
} from './meme-generator-draw'
import { qrStyleKey, renderQrImage } from './meme-generator-qr'
import { PLATFORM_NAME } from '@/lib/branding/platform'

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

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
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

  const [design, setDesign] = useState<MemeDesign>(DEFAULT_DESIGN)
  const { background, textLines, logo, qr } = design

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
  const [showQrAdvanced, setShowQrAdvanced] = useState(false)

  const setBackground = (patch: Partial<MemeDesign['background']>) =>
    setDesign((prev) => ({
      ...prev,
      background: { ...prev.background, ...patch },
    }))

  // A position past the edge the logo's size allows is pulled back in.
  const setLogo = (patch: Partial<MemeDesign['logo']>) =>
    setDesign((prev) => {
      const next = { ...prev.logo, ...patch }
      const max = CANVAS_SIZE - next.size
      return {
        ...prev,
        logo: {
          ...next,
          bottom: Math.min(next.bottom, max),
          right: Math.min(next.right, max),
        },
      }
    })

  const setQr = (patch: Partial<MemeDesign['qr']>) =>
    setDesign((prev) => ({ ...prev, qr: { ...prev.qr, ...patch } }))

  const updateTextLine = (
    index: number,
    property: keyof TextLine,
    value: string | number | boolean,
  ) => {
    setDesign((prev) => {
      const updated = [...prev.textLines]
      updated[index] = { ...updated[index], [property]: value }
      return { ...prev, textLines: updated }
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

  // ── Assets ──────────────────────────────────────────────────────────────
  // Everything the design draws is decoded here, before it reaches the
  // canvas; `drawDesign` never waits. While any of it is still loading the
  // preview carries `data-capture-pending`, so Download waits for it.

  // The background image enters the design only once it has decoded, so the
  // draw that shows it is the one its arrival triggers.
  const [backgroundRaster, setBackgroundRaster] = useState<Raster | null>(null)
  const [backgroundPending, setBackgroundPending] = useState(false)
  const backgroundUpload = useRef(0)

  const handleBackgroundImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const upload = ++backgroundUpload.current
    setBackgroundPending(true)
    try {
      const url = await readAsDataUrl(file)
      const image = new window.Image()
      image.src = url
      await image.decode()
      if (upload !== backgroundUpload.current) return
      setBackgroundRaster(image)
      setBackground({ image: { url, name: file.name } })
    } catch {
      // An image the browser cannot decode leaves the background as it was.
    } finally {
      if (upload === backgroundUpload.current) setBackgroundPending(false)
    }
  }

  const clearBackgroundImage = () => {
    backgroundUpload.current++
    setBackgroundPending(false)
    setBackgroundRaster(null)
    setBackground({ image: null })
  }

  // The QR image depends on its style alone. Its effect lists those fields —
  // not the design, and not a draw function — so editing text, colours or
  // positions never regenerates it.
  const {
    url: qrUrl,
    size: qrSize,
    dotsColor: qrDotsColor,
    backgroundColor: qrBackgroundColor,
    dotsType: qrDotsType,
    cornerSquareType: qrCornerSquareType,
    cornerDotType: qrCornerDotType,
  } = qr
  const qrKey = qrStyleKey(qr)
  const [qrRaster, setQrRaster] = useState<{
    key: string
    image: CanvasImageSource | null
  } | null>(null)
  useEffect(() => {
    if (!qrUrl) return
    const style: QrStyle = {
      url: qrUrl,
      size: qrSize,
      dotsColor: qrDotsColor,
      backgroundColor: qrBackgroundColor,
      dotsType: qrDotsType,
      cornerSquareType: qrCornerSquareType,
      cornerDotType: qrCornerDotType,
    }
    const key = qrStyleKey(style)
    let cancelled = false
    renderQrImage(style).then(
      (image) => !cancelled && setQrRaster({ key, image }),
      // A failed image is settled too: nothing to draw, nothing to wait for.
      () => !cancelled && setQrRaster({ key, image: null }),
    )
    return () => {
      cancelled = true
    }
  }, [
    qrUrl,
    qrSize,
    qrDotsColor,
    qrBackgroundColor,
    qrDotsType,
    qrCornerSquareType,
    qrCornerDotType,
  ])
  const qrPending = Boolean(qrUrl) && qrRaster?.key !== qrKey

  // The logo's variant and monochrome ink follow the DESIGN's background, not
  // the admin's light/dark theme.
  const lightBackground = designIsLight(design)
  const uploadedLogoSvg = logoSvgFor(conferenceLogos, lightBackground)
  const logoName = conferenceLogos?.title?.trim() || PLATFORM_NAME
  const uploadedLogoKey = uploadedLogoSvg
    ? logoRasterKey(uploadedLogoSvg, logoTint(logo.variant, lightBackground))
    : null

  // Every raster the design can switch to, decoded up front (see
  // logoRasterRequests). One that cannot be drawn falls back to the wordmark;
  // until the set has decoded, just after mount, there is no logo.
  const [logoRasters, setLogoRasters] = useState<
    ReadonlyMap<string, CanvasLogo | null>
  >(() => new Map())

  const canvasLogo = useMemo<CanvasLogo | null>(() => {
    const wordmark: CanvasLogo = { kind: 'wordmark', name: logoName }
    if (!uploadedLogoKey) return wordmark
    if (!logoRasters.has(uploadedLogoKey)) return null
    return logoRasters.get(uploadedLogoKey) ?? wordmark
  }, [uploadedLogoKey, logoRasters, logoName])

  const logoPending =
    uploadedLogoKey !== null && !logoRasters.has(uploadedLogoKey)

  const logoBright = conferenceLogos?.logoBright
  const logoDark = conferenceLogos?.logoDark
  useEffect(() => {
    const requests = logoRasterRequests({ logoBright, logoDark })
    if (requests.length === 0) return
    let cancelled = false
    Promise.all(
      requests.map(
        async ({ key, svg, tint }) =>
          [key, await loadLogoImage(svg, tint)] as const,
      ),
    ).then((entries) => {
      if (!cancelled) setLogoRasters(new Map(entries))
    })
    return () => {
      cancelled = true
    }
  }, [logoBright, logoDark])

  // Fonts are assets too: text wraps by measuring, so a face that lands late
  // re-wraps the line. Canvas text never pulls a webfont in on its own (see
  // meme-generator-fonts), so the faces are asked for explicitly. Keyed on
  // the faces themselves rather than on `textLines`: colour, alignment and
  // position edits rewrite that array without changing a single font.
  const fontRequestKey = textLines
    .filter((line) => line.text)
    .map((line) => `${canvasFontShorthand(line)}|${memeLineText(line)}`)
    .join('\n')

  const fontRequests = useMemo(
    () => fontRequestsForLines(textLines),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: identity tracks the requested faces, not every field of every line
    [fontRequestKey],
  )

  // Which set of faces has settled. Until then the canvas shows the fallback
  // and capture waits; a face that fails or is missing settles all the same.
  const [textFontsReadyFor, setTextFontsReadyFor] = useState('')
  const textFontsPending = fontRequestKey !== textFontsReadyFor
  useEffect(() => {
    let cancelled = false
    loadCanvasFonts(
      fontRequests,
      typeof document === 'undefined' ? undefined : document.fonts,
    ).then(() => {
      if (!cancelled) setTextFontsReadyFor(fontRequestKey)
    })
    return () => {
      cancelled = true
    }
  }, [fontRequests, fontRequestKey])

  // The wordmark is canvas text, so its webfont has to be asked for too —
  // whenever it is what gets drawn, including as the fallback for an uploaded
  // logo that could not be rasterised.
  const drawsWordmark = canvasLogo?.kind === 'wordmark'
  const [wordmarkReadyFor, setWordmarkReadyFor] = useState<string | null>(null)
  const wordmarkPending = drawsWordmark && wordmarkReadyFor !== logoName
  useEffect(() => {
    if (!drawsWordmark) return
    let cancelled = false
    const family = wordmarkFontFamily(document.documentElement)
    loadCanvasFonts(
      family ? [{ font: wordmarkFont(family, 72, false), text: logoName }] : [],
      document.fonts,
    ).then(() => {
      if (!cancelled) setWordmarkReadyFor(logoName)
    })
    return () => {
      cancelled = true
    }
  }, [drawsWordmark, logoName])

  const assets = useMemo(
    () => ({
      background: backgroundRaster,
      qr: qrRaster?.image ?? null,
      logo: canvasLogo,
    }),
    [backgroundRaster, qrRaster, canvasLogo],
  )

  // A layout effect: the canvas is painted in the same commit that clears
  // `data-capture-pending`, so a capture never sees the mark gone before the
  // asset is drawn. Font readiness is listed so a face that lands repaints.
  useLayoutEffect(() => {
    const root = document.documentElement
    const brand = {
      fontFamily: wordmarkFontFamily(root),
      gradient: brandGradientColors(root),
    }
    for (const canvas of [canvasRef.current, exportCanvasRef.current]) {
      const ctx = canvas?.getContext('2d')
      if (ctx) drawDesign(ctx, design, { ...assets, brand }, 0)
    }
  }, [design, assets, textFontsReadyFor, wordmarkReadyFor])

  const capturePending =
    backgroundPending ||
    qrPending ||
    logoPending ||
    textFontsPending ||
    wordmarkPending

  // The overlay carried the logo's accessible name; the canvas now does.
  const canvasLabel = `Meme preview with the ${logoName} logo`

  const previewNode = (
    <div
      className="relative mx-auto aspect-square w-[540px] max-w-full overflow-hidden rounded-lg shadow-lg"
      style={{ padding: 0, margin: 'auto' }}
      data-capture-pending={capturePending || undefined}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        role="img"
        aria-label={canvasLabel}
        className="block size-full"
        style={{ margin: 0, padding: 0, display: 'block' }}
      />
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
            role="img"
            aria-label={canvasLabel}
            className="size-full"
            style={{ margin: 0, padding: 0, display: 'block' }}
          />
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
                    isActive={background.color === color.value}
                    onClick={() => setBackground({ color: color.value })}
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
                    value={background.color}
                    onChange={(e) => setBackground({ color: e.target.value })}
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

            {background.image && (
              <div className="flex items-center gap-4">
                <p className="flex-1 text-sm text-brand-slate-gray dark:text-gray-300">
                  Current: {background.image.name}
                </p>
                <button
                  onClick={clearBackgroundImage}
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
                  value={logo.size}
                  onChange={(size) => setLogo({ size })}
                  min={LOGO_SIZE_MIN}
                  max={LOGO_SIZE_MAX}
                  icon={ArrowsPointingOutIcon}
                  suffix="px"
                />

                <Slider
                  id="logoVerticalPosition"
                  label="Logo Distance from Bottom"
                  value={logo.bottom}
                  onChange={(bottom) => setLogo({ bottom })}
                  min={0}
                  max={CANVAS_SIZE - logo.size}
                  icon={AdjustmentsHorizontalIcon}
                  suffix="px"
                />

                <Slider
                  id="logoHorizontalPosition"
                  label="Logo Distance from Right"
                  value={logo.right}
                  onChange={(right) => setLogo({ right })}
                  min={0}
                  max={CANVAS_SIZE - logo.size}
                  icon={AdjustmentsHorizontalIcon}
                  suffix="px"
                />

                <div>
                  <label className={styles.label}>Logo Style</label>
                  <div className="flex gap-3">
                    <ToggleButton
                      active={logo.variant === 'gradient'}
                      onClick={() => setLogo({ variant: 'gradient' })}
                    >
                      Gradient (Color)
                    </ToggleButton>
                    <ToggleButton
                      active={logo.variant === 'monochrome'}
                      onClick={() => setLogo({ variant: 'monochrome' })}
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
                value={qr.url}
                onChange={(e) => setQr({ url: e.target.value })}
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
                      onChange={(e) => setQr({ dotsColor: e.target.value })}
                      className="h-10 w-20 cursor-pointer rounded border border-brand-frosted-steel dark:border-gray-600"
                    />
                    <input
                      type="text"
                      value={qrDotsColor}
                      onChange={(e) => setQr({ dotsColor: e.target.value })}
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
                      onChange={(e) =>
                        setQr({ backgroundColor: e.target.value })
                      }
                      className="h-10 w-20 cursor-pointer rounded border border-brand-frosted-steel dark:border-gray-600"
                    />
                    <input
                      type="text"
                      value={qrBackgroundColor}
                      onChange={(e) =>
                        setQr({ backgroundColor: e.target.value })
                      }
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
                        onClick={() => setQr({ dotsType: type.value })}
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
                        onClick={() => setQr({ cornerSquareType: type.value })}
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
                        onClick={() => setQr({ cornerDotType: type.value })}
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
                  onChange={(size) => setQr({ size })}
                  min={QR_SIZE_MIN}
                  max={QR_SIZE_MAX}
                  suffix="px"
                />
                <Slider
                  id="qr-vertical"
                  label="Vertical Position"
                  value={qr.verticalPosition}
                  onChange={(verticalPosition) => setQr({ verticalPosition })}
                  min={0}
                  max={100}
                  suffix="%"
                />
                <Slider
                  id="qr-horizontal"
                  label="Horizontal Position"
                  value={qr.horizontalPosition}
                  onChange={(horizontalPosition) =>
                    setQr({ horizontalPosition })
                  }
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
