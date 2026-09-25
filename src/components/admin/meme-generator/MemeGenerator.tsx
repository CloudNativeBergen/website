'use client'

import {
  useState,
  useRef,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useCallback,
} from 'react'
import {
  PhotoIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AdjustmentsHorizontalIcon,
  ArrowsPointingOutIcon,
  QrCodeIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline'
import type { ConferenceLogos } from '../../common/DashboardLayout'
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
  type Raster,
} from './meme-generator-draw'
import { pickQrStyle, qrStyleKey, renderQrImage } from './meme-generator-qr'
import {
  FPS,
  FRAME,
  addScene,
  clampTime,
  duplicateScene,
  frameAt,
  moveScene,
  newScene,
  removeScene,
  sceneIndexAt,
  sceneStart,
  setSceneDuration,
  totalDuration,
  type Scene,
  type Transition,
} from './meme-generator-timeline'
import {
  allStates,
  canRedo,
  canUndo,
  record,
  redo,
  startHistory,
  undo,
} from './meme-generator-history'
import {
  drawFrame,
  offscreenLayers,
  type PaintScene,
} from './meme-generator-frame'
import { VideoTimeline, type SceneRefusal } from './VideoTimeline'
import { useMediaQuery } from '@/hooks/useMediaQuery'
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

const HistoryButton = ({
  label,
  icon: Icon,
  enabled,
  shortcuts,
  hint,
  onClick,
}: {
  label: string
  icon: React.ElementType
  enabled: boolean
  shortcuts: string
  hint: string
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    // Not `disabled`: the button keeps focus after the last step.
    aria-disabled={!enabled || undefined}
    aria-keyshortcuts={shortcuts}
    title={`${label} (${hint})`}
    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${styles.buttonInactive}`}
  >
    <Icon className="size-4" aria-hidden="true" />
    {label}
  </button>
)

export function MemeGenerator({
  conferenceLogos,
  wrapPreview,
}: MemeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const exportCanvasRef = useRef<HTMLCanvasElement>(null)

  // ── Scenes and time ─────────────────────────────────────────────────────
  // Image mode is a video of one scene that is never played: the image is
  // whichever scene the playhead is in, and switching to Video shows the
  // timeline over the same list.
  const [mode, setMode] = useState<'image' | 'video'>('image')
  // Every change to the scenes — timeline and design alike — is a step of
  // this history, so undo and redo cover all of it (see
  // meme-generator-history for how a drag or typing folds into one step).
  const [history, setHistory] = useState(() =>
    startHistory<Scene[]>([newScene(DEFAULT_DESIGN)]),
  )
  const scenes = history.present
  const changeScenes = (update: (prev: Scene[]) => Scene[], group?: string) => {
    const now = performance.now()
    setHistory((prev) => record(prev, update(prev.present), { group, now }))
  }
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const loopAllowed = !reducedMotion

  // The scene the controls edit: the one under the playhead while paused.
  // During playback the panel stays on the scene it was on — one that
  // swapped under the cursor every few seconds would be unusable.
  const [playbackEditingKey, setPlaybackEditingKey] = useState<string | null>(
    null,
  )
  const pausedIndex = sceneIndexAt(scenes, time)
  const frozenIndex = scenes.findIndex((s) => s.key === playbackEditingKey)
  const editingIndex = playing && frozenIndex >= 0 ? frozenIndex : pausedIndex
  const editingKey = scenes[editingIndex].key
  const design = scenes[editingIndex].design
  const { background, textLines, logo, qr } = design

  // `field` names what changed, so consecutive edits of one field of one
  // scene — a slider dragged, a line typed — are one undo step.
  const updateScene = (
    key: string,
    field: string | null,
    update: (prev: MemeDesign) => MemeDesign,
  ) =>
    changeScenes(
      (prev) =>
        prev.map((scene) =>
          scene.key === key
            ? { ...scene, design: update(scene.design) }
            : scene,
        ),
      field === null ? undefined : `${key}:${field}`,
    )
  const setDesign = (field: string, update: (prev: MemeDesign) => MemeDesign) =>
    updateScene(editingKey, field, update)

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

  const setBackground = (
    patch: Partial<MemeDesign['background']>,
    key = editingKey,
  ) =>
    // An image put in or taken out is always a step of its own.
    updateScene(
      key,
      'image' in patch ? null : `background.${Object.keys(patch).join()}`,
      (prev) => ({
        ...prev,
        background: { ...prev.background, ...patch },
      }),
    )

  // A position past the edge the logo's size allows is pulled back in.
  const setLogo = (patch: Partial<MemeDesign['logo']>) =>
    setDesign(`logo.${Object.keys(patch).join()}`, (prev) => {
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
    setDesign(`qr.${Object.keys(patch).join()}`, (prev) => ({
      ...prev,
      qr: { ...prev.qr, ...patch },
    }))

  const updateTextLine = (
    index: number,
    property: keyof TextLine,
    value: string | number | boolean,
  ) => {
    setDesign(`text${index}.${property}`, (prev) => {
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

  // Assets are kept for EVERY scene, keyed by what they depend on, so a
  // transition or a scrub to another scene never waits for a decode.

  // A background image enters its scene only once it has decoded, so the draw
  // that shows it is the one its arrival triggers.
  // Uploads are counted per scene: a newer upload, or a clear, supersedes
  // only its own scene's, never another scene's still decoding.
  const backgroundUploads = useRef(new Map<string, number>())
  const [uploadingScenes, setUploadingScenes] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const backgroundPending = uploadingScenes.size > 0
  const settleUpload = (sceneKey: string) =>
    setUploadingScenes((prev) => {
      const next = new Set(prev)
      next.delete(sceneKey)
      return next
    })

  // Decoded backgrounds, by URL. Pruned after each commit to exactly what the
  // committed history can show — the present and every step undo or redo
  // can return to, so an undone clear draws its image again — never while
  // updates are queued: two uploads that settle in one batch — one scene
  // taking an image up as another drops it — would otherwise judge by scenes
  // that are about to change. A ref, because an arrival always comes with
  // the scene update that shows it, which is what repaints.
  const backgroundRasters = useRef(new Map<string, Raster>())
  useEffect(() => {
    const kept = new Set(
      allStates(history).flatMap((states) =>
        states.flatMap((scene) => scene.design.background.image?.url ?? []),
      ),
    )
    for (const url of backgroundRasters.current.keys()) {
      if (!kept.has(url)) backgroundRasters.current.delete(url)
    }
  }, [history])

  const handleBackgroundImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    // Emptied at once, so picking the same file again — for another scene —
    // still fires a change.
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    // The scene the upload was made for, even if the playhead moves on.
    const sceneKey = editingKey
    const upload = (backgroundUploads.current.get(sceneKey) ?? 0) + 1
    backgroundUploads.current.set(sceneKey, upload)
    const isLatest = () => backgroundUploads.current.get(sceneKey) === upload
    setUploadingScenes((prev) => new Set(prev).add(sceneKey))
    try {
      const url = await readAsDataUrl(file)
      const image = new window.Image()
      image.src = url
      await image.decode()
      if (!isLatest()) return
      backgroundRasters.current.set(url, image)
      setBackground({ image: { url, name: file.name } }, sceneKey)
    } catch {
      // An image the browser cannot decode leaves the background as it was.
    } finally {
      if (isLatest()) settleUpload(sceneKey)
    }
  }

  const clearBackgroundImage = () => {
    backgroundUploads.current.set(
      editingKey,
      (backgroundUploads.current.get(editingKey) ?? 0) + 1,
    )
    settleUpload(editingKey)
    setBackground({ image: null })
  }

  // A QR image depends on its style alone: the effect is keyed on the set of
  // styles — not on the designs, and not on a draw function — so editing
  // text, colours or positions never regenerates one.
  const qrStyleByKey = new Map(
    scenes
      .filter((scene) => scene.design.qr.url)
      .map((scene) => [
        qrStyleKey(scene.design.qr),
        pickQrStyle(scene.design.qr),
      ]),
  )
  const qrKeys = [...qrStyleByKey.keys()]
  const qrKeySet = qrKeys.join('\n')
  const qrStyles = useMemo(
    () => [...qrStyleByKey],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: identity tracks the styles, not the QR positions
    [qrKeySet],
  )
  // Each style's image, generated once while any scene uses it.
  const qrRequests = useRef(
    new Map<string, Promise<CanvasImageSource | null>>(),
  )
  const [qrRasters, setQrRasters] = useState<
    ReadonlyMap<string, CanvasImageSource | null>
  >(() => new Map())
  useEffect(() => {
    const requests = qrRequests.current
    const wanted = new Set(qrStyles.map(([key]) => key))
    for (const key of requests.keys())
      if (!wanted.has(key)) requests.delete(key)
    let cancelled = false
    Promise.all(
      qrStyles.map(async ([key, style]) => {
        let request = requests.get(key)
        if (!request) {
          // A failed image is settled too: nothing to draw, nothing to wait for.
          request = renderQrImage(style).catch(() => null)
          requests.set(key, request)
        }
        return [key, await request] as const
      }),
    ).then((entries) => {
      if (!cancelled) setQrRasters(new Map(entries))
    })
    return () => {
      cancelled = true
    }
  }, [qrStyles])
  const qrPending = qrKeys.some((key) => !qrRasters.has(key))

  // The logo's variant and monochrome ink follow each DESIGN's background,
  // not the admin's light/dark theme.
  const logoName = conferenceLogos?.title?.trim() || PLATFORM_NAME
  const uploadedLogoKeyFor = useCallback(
    (scene: MemeDesign) => {
      const light = designIsLight(scene)
      const svg = logoSvgFor(conferenceLogos, light)
      return svg
        ? logoRasterKey(svg, logoTint(scene.logo.variant, light))
        : null
    },
    [conferenceLogos],
  )

  // Every raster a design can switch to, decoded up front (see
  // logoRasterRequests). One that cannot be drawn falls back to the wordmark;
  // until the set has decoded, just after mount, there is no logo.
  const [logoRasters, setLogoRasters] = useState<
    ReadonlyMap<string, CanvasLogo | null>
  >(() => new Map())

  const canvasLogoFor = useCallback(
    (scene: MemeDesign): CanvasLogo | null => {
      const wordmark: CanvasLogo = { kind: 'wordmark', name: logoName }
      const key = uploadedLogoKeyFor(scene)
      if (!key) return wordmark
      if (!logoRasters.has(key)) return null
      return logoRasters.get(key) ?? wordmark
    },
    [uploadedLogoKeyFor, logoRasters, logoName],
  )

  const logoPending = scenes.some((scene) => {
    const key = uploadedLogoKeyFor(scene.design)
    return key !== null && !logoRasters.has(key)
  })

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
  // meme-generator-fonts), so the faces of every scene are asked for
  // explicitly. Keyed on the faces themselves rather than on the text lines:
  // colour, alignment and position edits rewrite those without changing a
  // single font.
  const allTextLines = scenes.flatMap((scene) => scene.design.textLines)
  const fontRequestKey = allTextLines
    .filter((line) => line.text)
    .map((line) => `${canvasFontShorthand(line)}|${memeLineText(line)}`)
    .join('\n')

  const fontRequests = useMemo(
    () => fontRequestsForLines(allTextLines),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: identity tracks the requested faces, not every field of every line
    [fontRequestKey],
  )

  // Which set of faces has settled. Until then nothing is painted and capture
  // waits; a face that fails, is missing or times out settles all the same.
  const [textFontsReadyFor, setTextFontsReadyFor] = useState('')
  // Bumped when a face lands after its load timed out, to repaint in it.
  const [lateFaces, setLateFaces] = useState(0)
  const repaintLateFace = () => setLateFaces((count) => count + 1)
  const textFontsPending = fontRequestKey !== textFontsReadyFor
  useEffect(() => {
    let cancelled = false
    loadCanvasFonts(
      fontRequests,
      typeof document === 'undefined' ? undefined : document.fonts,
      { onLate: () => !cancelled && repaintLateFace() },
    ).then(() => {
      if (!cancelled) setTextFontsReadyFor(fontRequestKey)
    })
    return () => {
      cancelled = true
    }
  }, [fontRequests, fontRequestKey])

  // The wordmark is canvas text, so its webfont has to be asked for too —
  // whenever any scene draws it, including as the fallback for an uploaded
  // logo that could not be rasterised.
  const drawsWordmark = scenes.some(
    (scene) => canvasLogoFor(scene.design)?.kind === 'wordmark',
  )
  const [wordmarkReadyFor, setWordmarkReadyFor] = useState<string | null>(null)
  const wordmarkPending = drawsWordmark && wordmarkReadyFor !== logoName
  useEffect(() => {
    if (!drawsWordmark) return
    let cancelled = false
    const family = wordmarkFontFamily(document.documentElement)
    loadCanvasFonts(
      family ? [{ font: wordmarkFont(family, 72, false), text: logoName }] : [],
      document.fonts,
      { onLate: () => !cancelled && repaintLateFace() },
    ).then(() => {
      if (!cancelled) setWordmarkReadyFor(logoName)
    })
    return () => {
      cancelled = true
    }
  }, [drawsWordmark, logoName])

  /** A design's decoded assets, from the caches above. */
  const assetsFor = useCallback(
    (scene: MemeDesign) => ({
      background: scene.background.image
        ? (backgroundRasters.current.get(scene.background.image.url) ?? null)
        : null,
      qr: scene.qr.url ? (qrRasters.get(qrStyleKey(scene.qr)) ?? null) : null,
      logo: canvasLogoFor(scene),
    }),
    [qrRasters, canvasLogoFor],
  )

  const capturePending =
    backgroundPending ||
    qrPending ||
    logoPending ||
    textFontsPending ||
    wordmarkPending

  // ── Playback ────────────────────────────────────────────────────────────
  // Time comes from the clock against where playback (re)started, so a slow
  // frame is skipped rather than slowing the video down. Nothing autoplays.
  const total = totalDuration(scenes)
  const playbackAnchor = useRef({ time: 0, at: 0 })

  // Playback carries on from wherever the playhead is put.
  const moveTo = (next: number) => {
    playbackAnchor.current = { time: next, at: performance.now() }
    setTime(next)
  }
  const seek = (to: number) => moveTo(clampTime(scenes, to))

  const togglePlayback = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    // Play from the start again once the end has been reached — or its last
    // frame, where an edit at the end leaves the playhead.
    // Counted in whole frames: the playhead's sum and the total's can differ
    // in the last bit, so "a frame short" is not a subtraction.
    seek(Math.round(time * FPS) >= Math.round(total * FPS) - 1 ? 0 : time)
    setPlaybackEditingKey(editingKey)
    setPlaying(true)
  }

  const advance = useEffectEvent((now: number) => {
    // A frame's timestamp can fall a moment before an anchor set by a seek
    // in the same frame; time never runs backwards from where it was put.
    const next =
      playbackAnchor.current.time +
      Math.max(0, now - playbackAnchor.current.at) / 1000
    if (next < total) {
      setTime(next)
      return true
    }
    // Looping jumps back to the start; under reduced motion it never loops.
    if (loop && loopAllowed) {
      playbackAnchor.current = { time: 0, at: now }
      setTime(0)
      return true
    }
    setTime(total)
    setPlaying(false)
    return false
  })

  useEffect(() => {
    if (!playing) return
    let frame = requestAnimationFrame(function tick(now) {
      if (advance(now)) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])

  // Why the last scene change was refused, until the history moves on — a
  // change, an undo or a redo clears it.
  const [refusal, setRefusal] = useState<
    (SceneRefusal & { for: typeof history }) | null
  >(null)
  const refused = refusal?.for === history ? refusal : null
  const refuse = (action: SceneRefusal['action'], reason: string) =>
    setRefusal((prev) => ({
      action,
      reason,
      for: history,
      // Counted, so the same reason given again is a new announcement.
      seq: (prev?.seq ?? 0) + 1,
    }))

  // A scene list reordered, grown or shrunk as one step, and the playhead put
  // `at` a time in it — during playback the controls follow `editKey`, when
  // given. Every scene that was already there is taken from the latest state,
  // not from this render's: a background upload that lands in between is
  // kept, not overwritten.
  const replaceScenes = (next: Scene[], at: number, editKey?: string) => {
    changeScenes((prev) =>
      next.map((scene) => prev.find((p) => p.key === scene.key) ?? scene),
    )
    moveTo(clampTime(next, at))
    if (editKey) setPlaybackEditingKey(editKey)
  }

  // A new scene goes at the end, and a copy right after its original; the
  // playhead goes to its start so the controls edit it — during playback
  // too: it is what was just asked for. Either is refused, with the reason,
  // when it would take the video past a minute.
  const applySceneChange = (
    action: 'add' | 'duplicate',
    change: ReturnType<typeof addScene>,
  ) => {
    if (!change.ok) {
      refuse(action, change.reason)
      return
    }
    replaceScenes(
      change.scenes,
      sceneStart(change.scenes, change.index),
      change.scenes[change.index].key,
    )
  }
  const addNewScene = () =>
    applySceneChange('add', addScene(scenes, DEFAULT_DESIGN))
  const duplicate = (index: number) =>
    applySceneChange('duplicate', duplicateScene(scenes, index))

  const remove = (index: number) => {
    const removed = removeScene(scenes, index, time)
    if (!removed.ok) {
      refuse('delete', removed.reason)
      return
    }
    // During playback the controls move to the scene that took the deleted
    // one's place, and stay on it.
    replaceScenes(
      removed.scenes,
      removed.time,
      removed.scenes[sceneIndexAt(removed.scenes, removed.time)].key,
    )
  }

  const move = (from: number, to: number) => {
    const moved = moveScene(scenes, from, to, time)
    if (moved.scenes !== scenes) replaceScenes(moved.scenes, moved.time)
  }

  // The playhead keeps its place in the scene being edited, so a length
  // typed into the field never moves the controls to another scene.
  const changeDuration = (index: number, seconds: number) => {
    const next = setSceneDuration(scenes, index, seconds)
    changeScenes(
      (prev) => setSceneDuration(prev, index, seconds),
      `${scenes[index].key}:duration`,
    )
    if (playing) return
    const offset = time - sceneStart(scenes, editingIndex)
    const start = sceneStart(next, editingIndex)
    const last = next[editingIndex].duration - FRAME
    moveTo(start + Math.min(offset, last))
  }

  // A pick from a list is a step of its own, however quickly the next one
  // follows.
  const changeTransition = (index: number, transition: Transition) =>
    changeScenes((prev) =>
      prev.map((scene, i) => (i === index ? { ...scene, transition } : scene)),
    )

  // Undo and redo put the scenes back; the playhead stays where it is, kept
  // inside the video, so the scene under it is what the controls edit.
  const travel = (to: typeof undo) => {
    const next = to(history)
    if (next === history) return
    setHistory((prev) => to(prev))
    const at = clampTime(next.present, time)
    moveTo(at)
    // During playback the controls stay on their scene; if undo took it
    // away, they settle on the scene under the playhead and stay there.
    if (!next.present.some((scene) => scene.key === playbackEditingKey))
      setPlaybackEditingKey(next.present[sceneIndexAt(next.present, at)].key)
  }
  const rootRef = useRef<HTMLDivElement>(null)
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      !(event.metaKey || event.ctrlKey)
    )
      return
    // By the letter where the layout types one, else by the physical key:
    // on a Cyrillic or Greek layout, Ctrl+Z types "я" or "ζ".
    // Never with Alt: Windows reports AltGr as Ctrl+Alt, and AltGr types.
    if (event.altKey) return
    const letter = /^[a-z]$/i.test(event.key)
      ? event.key.toLowerCase()
      : /^\p{L}$/u.test(event.key)
        ? event.code.replace(/^Key/, '').toLowerCase()
        : ''
    const isUndo = letter === 'z' && !event.shiftKey
    const isRedo =
      (letter === 'z' && event.shiftKey) || (letter === 'y' && event.ctrlKey)
    if (!isUndo && !isRedo) return
    // Typing into a design's text is a step like any other, so the shortcut
    // is the editor's even in those fields. Not in a field that holds an
    // uncommitted draft of its own (the timeline's seconds), and not for a
    // key pressed elsewhere on the page.
    const target = event.target
    if (target instanceof Element) {
      if (target.closest('[data-own-undo]')) return
      if (target !== document.body && !rootRef.current?.contains(target)) return
    }
    event.preventDefault()
    travel(isUndo ? undo : redo)
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut(event)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])

  const switchMode = (next: 'image' | 'video') => {
    setPlaying(false)
    setMode(next)
  }

  // Two offscreen canvases for transitions, made the first time one is drawn.
  const [layers] = useState(offscreenLayers)

  // Only a complete frame is painted: while any asset is still loading the
  // canvas keeps the last one, so no frame shows a fallback font, a stale QR
  // or a missing logo. A layout effect, so the paint lands in the same commit
  // that clears `data-capture-pending` and a capture never sees one without
  // the other. Scrubbing and playback both paint through `drawFrame`: a time
  // shows the same picture however it was reached.
  useLayoutEffect(() => {
    if (capturePending) return
    const root = document.documentElement
    const brand = {
      fontFamily: wordmarkFontFamily(root),
      gradient: brandGradientColors(root),
    }
    const paintScene: PaintScene = (ctx, { index, time: sceneTime }) => {
      const scene = scenes[index].design
      drawDesign(ctx, scene, { ...assetsFor(scene), brand }, sceneTime)
    }
    for (const canvas of [canvasRef.current, exportCanvasRef.current]) {
      const ctx = canvas?.getContext('2d')
      if (!ctx) continue
      if (mode === 'video')
        drawFrame(ctx, frameAt(scenes, time), paintScene, layers)
      else drawDesign(ctx, design, { ...assetsFor(design), brand }, 0)
    }
  }, [mode, scenes, design, time, assetsFor, layers, capturePending, lateFaces])

  // The overlay carried the logo's accessible name; the canvas now does.
  const canvasLabel =
    mode === 'video'
      ? `Video preview with the ${logoName} logo`
      : `Meme preview with the ${logoName} logo`

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
    <div ref={rootRef} className="grid gap-4 lg:grid-cols-2">
      {/* In Video mode the preview and the timeline together can be taller
          than a laptop screen; the sticky column then scrolls on its own so
          the timeline is never stranded below the fold. */}
      <div
        className={`min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start ${
          mode === 'video'
            ? // A scroller clips on both axes: the padding, cancelled by the
              // margin, leaves the preview's shadow room inside it.
              'lg:-mx-4 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:px-4 lg:pb-4'
            : ''
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div
            role="group"
            aria-label="Output"
            className="flex w-fit rounded-lg border border-brand-frosted-steel p-0.5 dark:border-gray-600"
          >
            {(['image', 'video'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => switchMode(option)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === option
                    ? 'bg-brand-cloud-blue text-white dark:bg-blue-600'
                    : 'text-brand-slate-gray hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {option === 'image' ? 'Image' : 'Video'}
              </button>
            ))}
          </div>
          <div role="group" aria-label="History" className="flex gap-1">
            <HistoryButton
              label="Undo"
              icon={ArrowUturnLeftIcon}
              enabled={canUndo(history)}
              shortcuts="Control+Z Meta+Z"
              hint="⌘Z / Ctrl+Z"
              onClick={() => travel(undo)}
            />
            <HistoryButton
              label="Redo"
              icon={ArrowUturnRightIcon}
              enabled={canRedo(history)}
              shortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
              hint="⇧⌘Z / Ctrl+Y"
              onClick={() => travel(redo)}
            />
          </div>
        </div>
        {wrapPreview ? wrapPreview(previewNode) : previewNode}
        {exportNode}
        {mode === 'video' && (
          <VideoTimeline
            scenes={scenes}
            time={time}
            editingIndex={editingIndex}
            playing={playing}
            loop={loop}
            loopAllowed={loopAllowed}
            onSeek={seek}
            onDurationChange={changeDuration}
            onTransitionChange={changeTransition}
            onAddScene={addNewScene}
            onDuplicateScene={duplicate}
            onDeleteScene={remove}
            onMoveScene={move}
            refusal={refused}
            onPlayToggle={togglePlayback}
            onLoopChange={setLoop}
          />
        )}
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
                      value={qr.dotsColor}
                      onChange={(e) => setQr({ dotsColor: e.target.value })}
                      className="h-10 w-20 cursor-pointer rounded border border-brand-frosted-steel dark:border-gray-600"
                    />
                    <input
                      type="text"
                      value={qr.dotsColor}
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
                      value={qr.backgroundColor}
                      onChange={(e) =>
                        setQr({ backgroundColor: e.target.value })
                      }
                      className="h-10 w-20 cursor-pointer rounded border border-brand-frosted-steel dark:border-gray-600"
                    />
                    <input
                      type="text"
                      value={qr.backgroundColor}
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
                        active={qr.dotsType === type.value}
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
                        active={qr.cornerSquareType === type.value}
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
                        active={qr.cornerDotType === type.value}
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
                  value={qr.size}
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
