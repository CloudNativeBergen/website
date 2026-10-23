'use client'

/**
 * PROTOTYPE — throwaway. Answers "how should creating a Wall Post on a phone
 * work and feel?" (wayfinder ticket #1477, map #1474). Three structurally
 * different flows, switchable with the floating bar or ← →:
 *
 *   A  Polaroid composer — one screen, WYSIWYG wall card, handwritten caption
 *      under the photo, passive consent line, own pending post with Delete.
 *   B  Stories editor — fullscreen dark editor, swipe filters, text drawn ON the
 *      photo, consent checkbox at send, "My posts" sheet with Delete.
 *   C  Step-by-step — one decision per screen, consent gate first, plain
 *      caption under the photo, no pending view (LiveWall style).
 *
 * No persistence, no network: state lives in useState and is printed in the
 * "Prototype state" panel. Filters are CSS here; the real flow would bake them
 * into the uploaded JPEG on the phone (see research #1476).
 * Lives on branch prototype/photo-wall-phone-flow; never merged.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  PhotoIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

// ---------------------------------------------------------------------------
// Shared model
// ---------------------------------------------------------------------------

export type Variant = 'A' | 'B' | 'C'
type Aspect = 'square' | 'portrait' | 'original'
type Status = 'pending' | 'live' | 'rejected'

interface Crop {
  x: number
  y: number
  zoom: number
}

export interface Draft {
  photo: string | null
  filter: FilterKey
  crop: Crop
  aspect: Aspect
  text: string
  overlay: { x: number; y: number; colour: OverlayColour }
  name: string
  consent: boolean
}

interface SentPost {
  id: number
  draft: Draft
  status: Status
}

export type FilterKey =
  | 'original'
  | 'vivid'
  | 'warm'
  | 'fade'
  | 'fjord'
  | 'aurora'
  | 'mono'
  | 'noir'
  | 'retro'

interface Filter {
  key: FilterKey
  label: string
  css: string
  tint?: string
  blend?: React.CSSProperties['mixBlendMode']
}

export const FILTERS: Filter[] = [
  { key: 'original', label: 'Original', css: 'none' },
  { key: 'vivid', label: 'Vivid', css: 'contrast(1.15) saturate(1.45)' },
  {
    key: 'warm',
    label: 'Warm',
    css: 'sepia(0.22) saturate(1.3) contrast(1.05) brightness(1.04)',
  },
  {
    key: 'fade',
    label: 'Fade',
    css: 'contrast(0.82) brightness(1.12) saturate(0.75)',
  },
  {
    key: 'fjord',
    label: 'Fjord',
    css: 'saturate(1.1) contrast(1.05) brightness(1.04)',
    tint: 'rgba(29, 78, 216, 0.45)',
    blend: 'soft-light',
  },
  {
    key: 'aurora',
    label: 'Aurora',
    css: 'contrast(1.1) saturate(1.3)',
    tint: 'linear-gradient(135deg, rgba(16,185,129,0.45), rgba(99,102,241,0.45))',
    blend: 'soft-light',
  },
  { key: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.1)' },
  {
    key: 'noir',
    label: 'Noir',
    css: 'grayscale(1) contrast(1.5) brightness(0.88)',
  },
  {
    key: 'retro',
    label: 'Retro',
    css: 'sepia(0.45) contrast(1.1) brightness(1.05) saturate(1.2)',
    tint: 'rgba(250, 204, 21, 0.14)',
    blend: 'multiply',
  },
]

export const filterOf = (key: FilterKey) =>
  FILTERS.find((f) => f.key === key) ?? FILTERS[0]

type OverlayColour = 'white' | 'black' | 'brand'
const OVERLAY_COLOURS: OverlayColour[] = ['white', 'black', 'brand']
const OVERLAY_CLASS: Record<OverlayColour, string> = {
  white: 'text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]',
  black: 'text-black [text-shadow:0_1px_6px_rgba(255,255,255,0.6)]',
  brand:
    'text-white bg-brand-cloud-blue/90 px-2 py-0.5 rounded-md box-decoration-clone',
}

/** Deterministic sample photos so the flow is clickable without a camera. */
export const SAMPLE_PHOTOS = [
  'https://picsum.photos/seed/cndn-wall-crowd/1200/1600',
  'https://picsum.photos/seed/cndn-wall-stage/1600/1200',
  'https://picsum.photos/seed/cndn-wall-coffee/1200/1500',
]

export const EMPTY_DRAFT: Draft = {
  photo: null,
  filter: 'original',
  crop: { x: 50, y: 50, zoom: 1 },
  aspect: 'square',
  text: '',
  overlay: { x: 50, y: 78, colour: 'white' },
  name: '',
  consent: false,
}

const CAPTION_MAX: Record<Variant, number> = { A: 80, B: 60, C: 140 }

export interface PhoneFlowPrototypeProps {
  variant: Variant
  conferenceName: string
  /** Jump straight to a screen (for stories and screenshots). */
  initialStep?: string
  initialDraft?: Partial<Draft>
  initialSent?: { status: Status; draft?: Partial<Draft> }[]
  /** Hide the floating variant switcher (screenshots of one variant). */
  hideSwitcher?: boolean
}

export function PhoneFlowPrototype(props: PhoneFlowPrototypeProps) {
  const [variant, setVariant] = useState<Variant>(props.variant)
  useEffect(() => setVariant(props.variant), [props.variant])

  const common = {
    conferenceName: props.conferenceName,
    initialStep: variant === props.variant ? props.initialStep : undefined,
    initialDraft: { ...EMPTY_DRAFT, ...props.initialDraft },
    initialSent: (props.initialSent ?? []).map((s, i) => ({
      id: i + 1,
      status: s.status,
      draft: {
        ...EMPTY_DRAFT,
        photo: SAMPLE_PHOTOS[i % SAMPLE_PHOTOS.length],
        ...s.draft,
      },
    })),
  }

  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap"
        precedence="default"
      />
      {variant === 'A' && <VariantA key="A" {...common} />}
      {variant === 'B' && <VariantB key="B" {...common} />}
      {variant === 'C' && <VariantC key="C" {...common} />}
      {!props.hideSwitcher && (
        <PrototypeSwitcher current={variant} onChange={setVariant} />
      )}
    </>
  )
}

interface VariantProps {
  conferenceName: string
  initialStep?: string
  initialDraft: Draft
  initialSent: SentPost[]
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function usePhotoPicker(onPicked: (url: string) => void) {
  const sample = useRef(0)
  const fromFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onPicked(URL.createObjectURL(file))
    e.target.value = ''
  }
  const fromSample = () => {
    onPicked(SAMPLE_PHOTOS[sample.current % SAMPLE_PHOTOS.length])
    sample.current += 1
  }
  return { fromFile, fromSample }
}

function PickButton({
  capture,
  onChange,
  className,
  children,
  label,
}: {
  capture?: boolean
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  className: string
  children: ReactNode
  label: string
}) {
  return (
    <label className={className} aria-label={label}>
      <input
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        className="sr-only"
        onChange={onChange}
      />
      {children}
    </label>
  )
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n))

/** The photo with crop (drag to reposition), zoom and filter applied. */
function PhotoFrame({
  draft,
  onCrop,
  className = '',
  children,
}: {
  draft: Draft
  onCrop?: (crop: Crop) => void
  className?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null)
  const [ratio, setRatio] = useState(1)
  const filter = filterOf(draft.filter)

  const aspectStyle =
    draft.aspect === 'square'
      ? '1 / 1'
      : draft.aspect === 'portrait'
        ? '4 / 5'
        : `${ratio}`

  const down = (e: ReactPointerEvent) => {
    if (!onCrop) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, crop: draft.crop }
  }
  const move = (e: ReactPointerEvent) => {
    if (!onCrop || !drag.current || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const start = drag.current
    onCrop({
      ...start.crop,
      x: clamp(start.crop.x - ((e.clientX - start.x) / width) * 100, 0, 100),
      y: clamp(start.crop.y - ((e.clientY - start.y) / height) * 100, 0, 100),
    })
  }
  const up = () => {
    drag.current = null
  }

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden bg-gray-200 select-none dark:bg-gray-800 ${onCrop ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${className}`}
      style={{ aspectRatio: aspectStyle }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {draft.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={draft.photo}
          alt=""
          draggable={false}
          onLoad={(e) =>
            setRatio(
              e.currentTarget.naturalWidth / e.currentTarget.naturalHeight,
            )
          }
          className="pointer-events-none absolute inset-0 size-full object-cover"
          style={{
            objectPosition: `${draft.crop.x}% ${draft.crop.y}%`,
            transform: `scale(${draft.crop.zoom})`,
            transformOrigin: `${draft.crop.x}% ${draft.crop.y}%`,
            filter: filter.css,
          }}
        />
      )}
      {filter.tint && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: filter.tint, mixBlendMode: filter.blend }}
        />
      )}
      {children}
    </div>
  )
}

function FilterStrip({
  draft,
  onPick,
  dark = false,
}: {
  draft: Draft
  onPick: (key: FilterKey) => void
  dark?: boolean
}) {
  return (
    <div className="-mx-4 flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1">
      {FILTERS.map((f) => {
        const on = f.key === draft.filter
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onPick(f.key)}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <PhotoFrame
              draft={{ ...draft, filter: f.key, aspect: 'square' }}
              className={`w-16 rounded-lg ring-2 ${on ? 'ring-brand-cloud-blue' : 'ring-transparent'}`}
            />
            <span
              className={`text-xs ${on ? 'font-semibold' : ''} ${dark ? 'text-white/80' : 'text-gray-600 dark:text-gray-300'}`}
            >
              {f.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Polaroid({
  draft,
  tilt = 0,
  small = false,
  className = '',
  children,
}: {
  draft: Draft
  tilt?: number
  small?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <figure
      className={`relative bg-white ${small ? 'p-2 pb-1' : 'p-3 pb-2'} text-gray-900 shadow-lg ring-1 ring-black/5 ${className}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <PhotoFrame draft={{ ...draft, aspect: 'square' }} />
      <figcaption
        className={`${small ? 'min-h-6' : 'min-h-[3.25rem]'} pt-2 font-['Caveat',cursive] leading-tight`}
      >
        {draft.text && (
          <span className={`block ${small ? 'text-sm' : 'text-xl'}`}>
            {draft.text}
          </span>
        )}
        {draft.name && (
          <span className="block text-right text-lg text-gray-500">
            — {draft.name}
          </span>
        )}
      </figcaption>
      {children}
    </figure>
  )
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, [string, string, typeof ClockIcon]> = {
    pending: [
      'Waiting for approval',
      'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
      ClockIcon,
    ],
    live: [
      'On the wall',
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100',
      CheckCircleIcon,
    ],
    rejected: [
      'Not shown',
      'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      XMarkIcon,
    ],
  }
  const [label, cls, Icon] = map[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  )
}

/** Organizer actions the prototype fakes, so the waiting state can resolve. */
function SimulateModeration({
  onApprove,
  onReject,
}: {
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-fuchsia-400 p-3 text-xs text-fuchsia-700 dark:text-fuchsia-300">
      <p className="mb-2 font-semibold">
        Prototype: pretend to be the organizer
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="rounded bg-fuchsia-600 px-2 py-1 text-white"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded border border-fuchsia-600 px-2 py-1"
        >
          Reject
        </button>
      </div>
    </div>
  )
}

function StatePanel({
  variant,
  step,
  draft,
  sent,
  dark = false,
}: {
  variant: Variant
  step: string
  draft: Draft
  sent: SentPost[]
  dark?: boolean
}) {
  const payload = {
    variant,
    step,
    wallPost: {
      textPlacement: variant === 'B' ? 'on the photo' : 'caption under photo',
      filter: draft.filter,
      crop: draft.crop,
      aspect: variant === 'A' ? 'square (polaroid)' : draft.aspect,
      text: draft.text || null,
      overlay: variant === 'B' && draft.text ? draft.overlay : undefined,
      name: draft.name || null,
      consent:
        variant === 'B'
          ? draft.consent
          : variant === 'C'
            ? 'accepted at the gate'
            : 'implied by posting',
      upload:
        variant === 'B'
          ? 'JPEG with filter + text baked in, EXIF stripped'
          : 'JPEG with filter baked in, EXIF stripped; text sent separately',
    },
    sent: sent.map((s) => ({ id: s.id, status: s.status })),
  }
  return (
    <details
      className={`border-t px-4 py-3 pb-24 text-xs ${dark ? 'border-white/10 bg-black text-white/70' : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400'}`}
    >
      <summary className="cursor-pointer font-semibold">
        Prototype state
      </summary>
      <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-snug whitespace-pre-wrap">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  )
}

const VARIANT_NAMES: Record<Variant, string> = {
  A: 'Polaroid composer',
  B: 'Stories editor',
  C: 'Step-by-step',
}

function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: Variant
  onChange: (v: Variant) => void
}) {
  const order: Variant[] = ['A', 'B', 'C']
  const go = useCallback(
    (delta: number) =>
      onChange(order[(order.indexOf(current) + delta + 3) % 3]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, onChange],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, [contenteditable]')) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-1 py-1 text-xs font-semibold text-white shadow-xl">
      <button
        type="button"
        onClick={() => go(-1)}
        className="rounded-full p-1.5 hover:bg-white/20"
        aria-label="Previous variant"
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="px-1 whitespace-nowrap">
        {current} · {VARIANT_NAMES[current]}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="rounded-full p-1.5 hover:bg-white/20"
        aria-label="Next variant"
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  )
}

function ConferenceBar({ name }: { name: string }) {
  return (
    <header className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-brand-cloud-blue dark:text-blue-400">
      <span className="grid size-6 place-items-center rounded-md bg-brand-cloud-blue text-[10px] font-bold text-white">
        CN
      </span>
      {name}
    </header>
  )
}

const PRIMARY =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-brand-cloud-blue px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue-hover disabled:opacity-40'
const SECONDARY =
  'flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3.5 text-base font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100'

// ---------------------------------------------------------------------------
// Variant A — Polaroid composer
// ---------------------------------------------------------------------------

function VariantA({
  conferenceName,
  initialStep,
  initialDraft,
  initialSent,
}: VariantProps) {
  const [step, setStep] = useState(initialStep ?? 'landing')
  const [draft, setDraft] = useState<Draft>({
    ...initialDraft,
    aspect: 'square',
  })
  const [sent, setSent] = useState<SentPost[]>(initialSent)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const picker = usePhotoPicker((photo) => {
    setDraft((d) => ({ ...d, photo, crop: EMPTY_DRAFT.crop }))
    setStep('compose')
  })
  const mine = sent.at(-1)
  const update = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...patch }))

  const submit = () => {
    setSent((s) => [...s, { id: s.length + 1, draft, status: 'pending' }])
    setStep('sent')
  }
  const setMineStatus = (status: Status) =>
    setSent((s) => s.map((p, i) => (i === s.length - 1 ? { ...p, status } : p)))

  return (
    <div className="min-h-screen bg-stone-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <ConferenceBar name={conferenceName} />

      {step === 'landing' && (
        <main className="px-4 pt-4 pb-10">
          <div className="relative mx-auto mb-6 h-60 w-full max-w-xs">
            {SAMPLE_PHOTOS.map((photo, i) => (
              <div
                key={photo}
                className={`absolute w-32 ${['top-6 left-0', 'top-0 left-[30%]', 'top-10 right-0'][i]}`}
              >
                <Polaroid
                  draft={{
                    ...EMPTY_DRAFT,
                    photo,
                    text: [
                      'kubectl apply -f joy',
                      'Best keynote!',
                      'Coffee #3',
                    ][i],
                  }}
                  tilt={[-8, 4, -3][i]}
                  small
                />
              </div>
            ))}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Put your photo on the wall
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Snap the moment, add a filter and a line of text, and watch it show
            up on the big screens.
          </p>
          <div className="mt-6 space-y-3">
            <PickButton
              capture
              onChange={picker.fromFile}
              className={PRIMARY}
              label="Take a photo"
            >
              <CameraIcon className="size-5" />
              Take a photo
            </PickButton>
            <PickButton
              onChange={picker.fromFile}
              className={SECONDARY}
              label="Choose from your photos"
            >
              <PhotoIcon className="size-5" />
              Choose from your photos
            </PickButton>
            <button
              type="button"
              onClick={picker.fromSample}
              className="w-full text-center text-sm text-fuchsia-600 underline"
            >
              Prototype: use a sample photo
            </button>
          </div>
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            An organizer checks every photo before it appears.
          </p>
        </main>
      )}

      {step === 'compose' && (
        <main className="px-4 pb-10">
          <button
            type="button"
            onClick={() => setStep('landing')}
            className="mb-3 flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400"
          >
            <ArrowLeftIcon className="size-4" /> Another photo
          </button>
          <div className="mx-auto max-w-xs">
            <figure className="bg-white p-3 pb-2 text-gray-900 shadow-lg ring-1 ring-black/5">
              <PhotoFrame draft={draft} onCrop={(crop) => update({ crop })} />
              <input
                value={draft.text}
                onChange={(e) =>
                  update({ text: e.target.value.slice(0, CAPTION_MAX.A) })
                }
                placeholder="Write something…"
                className="mt-2 w-full bg-transparent font-['Caveat',cursive] text-xl leading-tight outline-none placeholder:text-gray-400"
              />
              <input
                value={draft.name}
                onChange={(e) => update({ name: e.target.value.slice(0, 40) })}
                placeholder="— your name (optional)"
                className="w-full bg-transparent text-right font-['Caveat',cursive] text-lg text-gray-500 outline-none placeholder:text-gray-300"
              />
            </figure>
            <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
              Drag the photo to move it · {draft.text.length}/{CAPTION_MAX.A}
            </p>
          </div>
          <div className="mt-5">
            <FilterStrip
              draft={draft}
              onPick={(filter) => update({ filter })}
            />
          </div>
          <p className="mt-5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Your photo, text and name are shown on the screens at the venue and
            on the public wall at the conference website. Only post photos the
            people in them are happy with.{' '}
            <a className="underline" href="#privacy">
              Privacy
            </a>
          </p>
          <button type="button" onClick={submit} className={`${PRIMARY} mt-3`}>
            Post to the wall
          </button>
        </main>
      )}

      {step === 'sent' && mine && (
        <main className="px-4 pb-10 text-center">
          <div className="mx-auto mt-2 w-64">
            <Polaroid draft={mine.draft} tilt={-2}>
              {mine.status === 'live' && (
                <SparklesIcon className="absolute -top-4 -right-4 size-10 text-amber-400" />
              )}
            </Polaroid>
          </div>
          <div className="mt-5">
            <StatusPill status={mine.status} />
          </div>
          <h2 className="mt-3 text-2xl font-bold">
            {mine.status === 'pending' && 'Sent! Almost there'}
            {mine.status === 'live' && 'You’re on the wall!'}
            {mine.status === 'rejected' && 'This one won’t be shown'}
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-gray-600 dark:text-gray-400">
            {mine.status === 'pending' &&
              'An organizer checks every photo. Keep this page open and you’ll see the moment it goes live.'}
            {mine.status === 'live' &&
              'Look up at the big screen, or open the wall on your phone.'}
            {mine.status === 'rejected' &&
              'The organizers decided not to show it. You’re welcome to post another photo.'}
          </p>
          <div className="mt-6 space-y-3">
            {mine.status === 'live' && (
              <a href="#wall" className={PRIMARY}>
                See the wall
              </a>
            )}
            <PickButton
              onChange={picker.fromFile}
              className={mine.status === 'live' ? SECONDARY : PRIMARY}
              label="Post another photo"
            >
              <PlusIcon className="size-5" />
              Post another photo
            </PickButton>
            {mine.status !== 'rejected' &&
              (confirmDelete ? (
                <div className="flex items-center justify-center gap-3 text-sm">
                  <span>Delete it for good?</span>
                  <button
                    type="button"
                    className="font-semibold text-red-600"
                    onClick={() => {
                      setSent((s) => s.slice(0, -1))
                      setConfirmDelete(false)
                      setStep('landing')
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mx-auto flex items-center gap-1 text-sm text-red-600"
                >
                  <TrashIcon className="size-4" /> Delete my post
                </button>
              ))}
          </div>
          {mine.status === 'pending' && (
            <SimulateModeration
              onApprove={() => setMineStatus('live')}
              onReject={() => setMineStatus('rejected')}
            />
          )}
        </main>
      )}

      <StatePanel variant="A" step={step} draft={draft} sent={sent} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant B — Stories editor (text on the photo)
// ---------------------------------------------------------------------------

function VariantB({
  conferenceName,
  initialStep,
  initialDraft,
  initialSent,
}: VariantProps) {
  const [step, setStep] = useState(initialStep ?? 'camera')
  const [draft, setDraft] = useState<Draft>({
    ...initialDraft,
    aspect: 'portrait',
  })
  const [sent, setSent] = useState<SentPost[]>(initialSent)
  const [editingText, setEditingText] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const picker = usePhotoPicker((photo) => {
    setDraft((d) => ({ ...d, photo, crop: EMPTY_DRAFT.crop }))
    setStep('edit')
  })
  const update = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...patch }))

  const cycleFilter = (delta: number) => {
    const i = FILTERS.findIndex((f) => f.key === draft.filter)
    const next = FILTERS[(i + delta + FILTERS.length) % FILTERS.length]
    update({ filter: next.key })
    setFlash(next.label)
  }
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(t)
  }, [flash])

  // swipe on the photo = change filter (drag-to-crop is off in this variant)
  const swipe = useRef<number | null>(null)

  // drag the text overlay
  const frame = useRef<HTMLDivElement>(null)
  const textDrag = useRef(false)
  const moveText = (e: ReactPointerEvent) => {
    if (!textDrag.current || !frame.current) return
    const r = frame.current.getBoundingClientRect()
    update({
      overlay: {
        ...draft.overlay,
        x: clamp(((e.clientX - r.left) / r.width) * 100, 10, 90),
        y: clamp(((e.clientY - r.top) / r.height) * 100, 8, 92),
      },
    })
  }

  const send = () => {
    setSent((s) => [...s, { id: s.length + 1, draft, status: 'pending' }])
    setStep('mine')
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {step === 'camera' && (
        <main className="flex min-h-[85vh] flex-col">
          <p className="px-4 pt-4 text-center text-sm font-semibold text-white/80">
            {conferenceName} · Photo Wall
          </p>
          <div className="mx-4 mt-4 flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-b from-gray-900 to-black p-6 text-center">
            <p className="text-2xl font-bold">Share the moment</p>
            <p className="mt-2 max-w-60 text-sm text-white/60">
              Your photo shows up on the screens after an organizer has had a
              look.
            </p>
          </div>
          <div className="flex items-center justify-between px-10 py-8">
            <PickButton
              onChange={picker.fromFile}
              className="grid size-12 place-items-center rounded-xl border border-white/30"
              label="Choose from your photos"
            >
              <PhotoIcon className="size-6" />
            </PickButton>
            <PickButton
              capture
              onChange={picker.fromFile}
              className="grid size-20 place-items-center rounded-full border-4 border-white"
              label="Take a photo"
            >
              <span className="size-14 rounded-full bg-white" />
            </PickButton>
            <button
              type="button"
              onClick={() => setStep('mine')}
              className="relative grid size-12 place-items-center rounded-xl border border-white/30 text-[10px] leading-tight"
            >
              My
              <br />
              posts
              {sent.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-brand-cloud-blue text-[10px]">
                  {sent.length}
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={picker.fromSample}
            className="pb-6 text-center text-sm text-fuchsia-400 underline"
          >
            Prototype: use a sample photo
          </button>
        </main>
      )}

      {(step === 'edit' || step === 'send') && (
        <main className="relative">
          <div className="flex items-center justify-between px-3 py-3">
            <button
              type="button"
              onClick={() => setStep('camera')}
              aria-label="Discard"
              className="rounded-full bg-white/10 p-2"
            >
              <XMarkIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!draft.text) update({ text: '' })
                setEditingText(true)
              }}
              className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold"
            >
              Aa
            </button>
          </div>
          <div
            ref={frame}
            className="relative mx-3 overflow-hidden rounded-2xl"
            onPointerDown={(e) => {
              if (!textDrag.current) swipe.current = e.clientX
            }}
            onPointerMove={moveText}
            onPointerUp={(e) => {
              textDrag.current = false
              if (swipe.current !== null) {
                const dx = e.clientX - swipe.current
                if (Math.abs(dx) > 40) cycleFilter(dx < 0 ? 1 : -1)
                swipe.current = null
              }
            }}
          >
            <PhotoFrame draft={draft} className="touch-pan-y">
              {draft.text && !editingText && (
                <span
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    textDrag.current = true
                    swipe.current = null
                  }}
                  onDoubleClick={() => setEditingText(true)}
                  className={`absolute max-w-[85%] -translate-x-1/2 -translate-y-1/2 cursor-move text-center text-2xl leading-tight font-extrabold ${OVERLAY_CLASS[draft.overlay.colour]}`}
                  style={{
                    left: `${draft.overlay.x}%`,
                    top: `${draft.overlay.y}%`,
                  }}
                >
                  {draft.text}
                </span>
              )}
            </PhotoFrame>
            {flash && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-3xl font-bold [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">
                {flash}
              </div>
            )}
            {editingText && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 p-6">
                <textarea
                  autoFocus
                  value={draft.text}
                  onChange={(e) =>
                    update({ text: e.target.value.slice(0, CAPTION_MAX.B) })
                  }
                  rows={2}
                  placeholder="Type something"
                  className="w-full resize-none bg-transparent text-center text-2xl font-extrabold text-white outline-none placeholder:text-white/40"
                />
                <div className="flex gap-3">
                  {OVERLAY_COLOURS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() =>
                        update({ overlay: { ...draft.overlay, colour: c } })
                      }
                      className={`size-7 rounded-full border-2 ${draft.overlay.colour === c ? 'border-white' : 'border-white/30'} ${c === 'white' ? 'bg-white' : c === 'black' ? 'bg-black' : 'bg-brand-cloud-blue'}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setEditingText(false)}
                  className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black"
                >
                  Done · {draft.text.length}/{CAPTION_MAX.B}
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-label={f.label}
                onClick={() => {
                  update({ filter: f.key })
                  setFlash(f.label)
                }}
                className={`size-1.5 rounded-full ${f.key === draft.filter ? 'bg-white' : 'bg-white/30'}`}
              />
            ))}
          </div>
          <p className="mt-1 text-center text-xs text-white/50">
            Swipe the photo for filters · drag the text to move it
          </p>
          <div className="flex justify-end px-4 py-4">
            <button
              type="button"
              onClick={() => setStep('send')}
              className="flex items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-black"
            >
              Next <ChevronRightIcon className="size-4" />
            </button>
          </div>

          {step === 'send' && (
            <div className="fixed inset-0 z-40 flex items-end bg-black/50">
              <div className="w-full rounded-t-3xl bg-white p-5 pb-8 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-300" />
                <h2 className="text-lg font-bold">Send to the wall</h2>
                <label className="mt-4 block text-sm font-medium">
                  Name on the post (optional)
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      update({ name: e.target.value.slice(0, 40) })
                    }
                    placeholder="e.g. Ingrid"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700"
                  />
                </label>
                <label className="mt-4 flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.consent}
                    onChange={(e) => update({ consent: e.target.checked })}
                    className="mt-0.5 size-5 shrink-0"
                  />
                  <span>
                    I’m OK with this photo being shown publicly on the venue
                    screens and the conference website, and so are the people in
                    it.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!draft.consent}
                  onClick={send}
                  className={`${PRIMARY} mt-5`}
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => setStep('edit')}
                  className="mt-3 w-full text-center text-sm text-gray-500"
                >
                  Back to editing
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      {step === 'mine' && (
        <main className="min-h-[85vh] bg-white px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">My posts</h2>
            <button
              type="button"
              onClick={() => setStep('camera')}
              className="flex items-center gap-1 rounded-full bg-brand-cloud-blue px-3 py-1.5 text-sm font-semibold text-white"
            >
              <CameraIcon className="size-4" /> New
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Only you see this list, on this phone.
          </p>
          {sent.length === 0 && (
            <p className="mt-10 text-center text-gray-500">Nothing yet.</p>
          )}
          <ul className="mt-4 space-y-4">
            {[...sent].reverse().map((post) => (
              <li
                key={post.id}
                className="flex gap-3 rounded-2xl border border-gray-200 p-2 dark:border-gray-800"
              >
                <PhotoFrame
                  draft={post.draft}
                  className="w-24 shrink-0 rounded-xl"
                >
                  {post.draft.text && (
                    <span
                      className={`absolute -translate-x-1/2 -translate-y-1/2 text-center text-[9px] leading-tight font-extrabold ${OVERLAY_CLASS[post.draft.overlay.colour]}`}
                      style={{
                        left: `${post.draft.overlay.x}%`,
                        top: `${post.draft.overlay.y}%`,
                      }}
                    >
                      {post.draft.text}
                    </span>
                  )}
                </PhotoFrame>
                <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
                  <div>
                    <StatusPill status={post.status} />
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {post.status === 'pending' &&
                        'An organizer will look at it soon.'}
                      {post.status === 'live' && 'Showing on the wall now.'}
                      {post.status === 'rejected' &&
                        'The organizers chose not to show this one.'}
                    </p>
                  </div>
                  {confirmDelete === post.id ? (
                    <div className="flex gap-3 text-sm">
                      <button
                        type="button"
                        className="font-semibold text-red-600"
                        onClick={() => {
                          setSent((s) => s.filter((p) => p.id !== post.id))
                          setConfirmDelete(null)
                        }}
                      >
                        Delete for good
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(post.id)}
                      className="flex items-center gap-1 self-start text-sm text-red-600"
                    >
                      <TrashIcon className="size-4" /> Delete
                    </button>
                  )}
                  {post.status === 'pending' && (
                    <span className="mt-1 flex gap-2 text-[11px] text-fuchsia-600">
                      Prototype:
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          setSent((s) =>
                            s.map((p) =>
                              p.id === post.id ? { ...p, status: 'live' } : p,
                            ),
                          )
                        }
                      >
                        approve
                      </button>
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          setSent((s) =>
                            s.map((p) =>
                              p.id === post.id
                                ? { ...p, status: 'rejected' }
                                : p,
                            ),
                          )
                        }
                      >
                        reject
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </main>
      )}

      <StatePanel variant="B" step={step} draft={draft} sent={sent} dark />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant C — Step-by-step wizard
// ---------------------------------------------------------------------------

const C_STEPS = ['photo', 'crop', 'filter', 'text', 'name', 'review'] as const
type CStep = (typeof C_STEPS)[number] | 'welcome' | 'done'

function VariantC({
  conferenceName,
  initialStep,
  initialDraft,
  initialSent,
}: VariantProps) {
  const [step, setStep] = useState<CStep>((initialStep as CStep) ?? 'welcome')
  const [draft, setDraft] = useState<Draft>({
    ...initialDraft,
    aspect: initialDraft.aspect === 'square' ? 'original' : initialDraft.aspect,
  })
  const [sent, setSent] = useState<SentPost[]>(initialSent)
  const picker = usePhotoPicker((photo) => {
    setDraft((d) => ({ ...d, photo, crop: EMPTY_DRAFT.crop }))
    setStep('crop')
  })
  const update = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...patch }))
  const index = C_STEPS.indexOf(step as (typeof C_STEPS)[number])
  const next = () => setStep(C_STEPS[index + 1])
  const back = () => setStep(index <= 0 ? 'welcome' : C_STEPS[index - 1])

  const Nav = ({
    label = 'Next',
    skip,
  }: {
    label?: string
    skip?: boolean
  }) => (
    <div className="mt-6 space-y-2">
      <button type="button" onClick={next} className={PRIMARY}>
        {label}
      </button>
      {skip && (
        <button
          type="button"
          onClick={next}
          className="w-full py-2 text-center text-sm text-gray-500"
        >
          Skip
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <ConferenceBar name={conferenceName} />

      {index >= 0 && (
        <div className="px-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={back} aria-label="Back">
              <ArrowLeftIcon className="size-5" />
            </button>
            <div className="flex flex-1 gap-1">
              {C_STEPS.map((s, i) => (
                <span
                  key={s}
                  className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-brand-cloud-blue' : 'bg-gray-200 dark:bg-gray-800'}`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500">
              {index + 1}/{C_STEPS.length}
            </span>
          </div>
        </div>
      )}

      <main className="px-4 pt-6 pb-10">
        {step === 'welcome' && (
          <>
            <h1 className="text-2xl font-bold">Welcome to the Photo Wall</h1>
            <ul className="mt-4 space-y-3 text-gray-700 dark:text-gray-300">
              <li className="flex gap-3">
                <CheckCircleIcon className="size-6 shrink-0 text-brand-fresh-green" />
                Your photo, text and name (if you give one) are shown publicly
                on the venue screens and the conference website.
              </li>
              <li className="flex gap-3">
                <CheckCircleIcon className="size-6 shrink-0 text-brand-fresh-green" />
                An organizer checks every photo before it appears.
              </li>
              <li className="flex gap-3">
                <CheckCircleIcon className="size-6 shrink-0 text-brand-fresh-green" />
                Only post photos the people in them are happy with.
              </li>
            </ul>
            <p className="mt-4 text-sm text-gray-500">
              Read more in our{' '}
              <a href="#privacy" className="underline">
                privacy policy
              </a>
              .
            </p>
            <button
              type="button"
              onClick={() => {
                update({ consent: true })
                setStep('photo')
              }}
              className={`${PRIMARY} mt-8`}
            >
              I agree, let’s go
            </button>
          </>
        )}

        {step === 'photo' && (
          <>
            <h2 className="text-xl font-bold">Pick a photo</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <PickButton
                capture
                onChange={picker.fromFile}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 font-semibold dark:border-gray-700"
                label="Camera"
              >
                <CameraIcon className="size-8 text-brand-cloud-blue" />
                Camera
              </PickButton>
              <PickButton
                onChange={picker.fromFile}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 font-semibold dark:border-gray-700"
                label="Library"
              >
                <PhotoIcon className="size-8 text-brand-cloud-blue" />
                Library
              </PickButton>
            </div>
            <button
              type="button"
              onClick={picker.fromSample}
              className="mt-4 w-full text-center text-sm text-fuchsia-600 underline"
            >
              Prototype: use a sample photo
            </button>
          </>
        )}

        {step === 'crop' && (
          <>
            <h2 className="text-xl font-bold">Crop</h2>
            <PhotoFrame
              draft={draft}
              onCrop={(crop) => update({ crop })}
              className="mt-4 rounded-xl"
            />
            <div className="mt-4 flex gap-2">
              {(['original', 'portrait', 'square'] as Aspect[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => update({ aspect: a })}
                  className={`flex-1 rounded-lg border px-2 py-2 text-sm ${draft.aspect === a ? 'border-brand-cloud-blue bg-brand-cloud-blue/10 font-semibold' : 'border-gray-300 dark:border-gray-700'}`}
                >
                  {a === 'original'
                    ? 'Original'
                    : a === 'portrait'
                      ? '4:5'
                      : '1:1'}
                </button>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm">
              Zoom
              <input
                type="range"
                min={1}
                max={2.5}
                step={0.05}
                value={draft.crop.zoom}
                onChange={(e) =>
                  update({ crop: { ...draft.crop, zoom: +e.target.value } })
                }
                className="flex-1"
              />
            </label>
            <Nav />
          </>
        )}

        {step === 'filter' && (
          <>
            <h2 className="text-xl font-bold">Choose a filter</h2>
            <PhotoFrame draft={draft} className="mt-4 rounded-xl" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => update({ filter: f.key })}
                  className="text-xs"
                >
                  <PhotoFrame
                    draft={{ ...draft, filter: f.key, aspect: 'square' }}
                    className={`rounded-lg ring-2 ${draft.filter === f.key ? 'ring-brand-cloud-blue' : 'ring-transparent'}`}
                  />
                  <span
                    className={draft.filter === f.key ? 'font-semibold' : ''}
                  >
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
            <Nav />
          </>
        )}

        {step === 'text' && (
          <>
            <h2 className="text-xl font-bold">Say something</h2>
            <p className="mt-1 text-sm text-gray-500">
              Shown under your photo on the wall.
            </p>
            <textarea
              autoFocus
              rows={4}
              value={draft.text}
              onChange={(e) =>
                update({ text: e.target.value.slice(0, CAPTION_MAX.C) })
              }
              placeholder="Great talk on eBPF! #CNDN"
              className="mt-4 w-full rounded-xl border border-gray-300 bg-transparent p-3 dark:border-gray-700"
            />
            <p className="text-right text-xs text-gray-500">
              {draft.text.length}/{CAPTION_MAX.C}
            </p>
            <Nav skip />
          </>
        )}

        {step === 'name' && (
          <>
            <h2 className="text-xl font-bold">Your name</h2>
            <p className="mt-1 text-sm text-gray-500">
              Optional. Leave it empty to post anonymously.
            </p>
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => update({ name: e.target.value.slice(0, 40) })}
              placeholder="e.g. Ingrid Hansen"
              className="mt-4 w-full rounded-xl border border-gray-300 bg-transparent p-3 dark:border-gray-700"
            />
            <Nav skip />
          </>
        )}

        {step === 'review' && (
          <>
            <h2 className="text-xl font-bold">Looks good?</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
              <PhotoFrame draft={draft} />
              {(draft.text || draft.name) && (
                <div className="p-3">
                  {draft.text && <p>{draft.text}</p>}
                  {draft.name && (
                    <p className="mt-1 text-sm text-gray-500">{draft.name}</p>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSent((s) => [
                  ...s,
                  { id: s.length + 1, draft, status: 'pending' },
                ])
                setStep('done')
              }}
              className={`${PRIMARY} mt-6`}
            >
              Upload
            </button>
          </>
        )}

        {step === 'done' && (
          <div className="pt-10 text-center">
            <CheckCircleIcon className="mx-auto size-16 text-brand-fresh-green" />
            <h2 className="mt-4 text-2xl font-bold">Upload complete</h2>
            <p className="mx-auto mt-2 max-w-xs text-gray-600 dark:text-gray-400">
              Your photo will appear on the wall once an organizer has approved
              it.
            </p>
            <button
              type="button"
              onClick={() => {
                setDraft({ ...EMPTY_DRAFT, consent: true, aspect: 'original' })
                setStep('photo')
              }}
              className={`${PRIMARY} mt-8`}
            >
              Post another photo
            </button>
            <a
              href="#wall"
              className="mt-3 block text-sm text-brand-cloud-blue underline"
            >
              See the wall
            </a>
          </div>
        )}
      </main>

      <StatePanel variant="C" step={step} draft={draft} sent={sent} />
    </div>
  )
}
