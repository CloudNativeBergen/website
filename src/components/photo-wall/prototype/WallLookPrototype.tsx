'use client'

/**
 * PROTOTYPE — throwaway. Answers "what should the Photo Wall look like, on the
 * public Wall page and in Screen Mode?" (wayfinder ticket #1478, map #1474).
 * Three structurally different looks, each with a phone Wall page and a
 * 1920×1080 Screen Mode, switchable with the floating bar or ← →:
 *
 *   A  Polaroid pinboard — scattered tilted cards, new posts drop in on top,
 *      idle screens swap older posts in from the archive.
 *   B  Modern mosaic — edge-to-edge masonry at original aspect (toggle: square
 *      crops), one rotating spotlight tile; a new post takes the spotlight.
 *   C  Spotlight + filmstrip — one big post at a time over a blurred copy of
 *      itself, an "up next" rail and a QR panel; a new post is next in line.
 *
 * The prototype panel fakes approvals, bursts and removals. No persistence,
 * no network (sample photos are picsum seeds). Lives on branch
 * prototype/photo-wall-look; never merged.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import {
  EMPTY_DRAFT,
  Polaroid,
  filterOf,
  type FilterKey,
} from './PhoneFlowPrototype'

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

interface Post {
  id: number
  photo: string
  w: number
  h: number
  filter: FilterKey
  text: string
  name: string
  minutesAgo: number
}

const SIZES: [number, number][] = [
  [1200, 1600],
  [1600, 1200],
  [1200, 1200],
  [1200, 1500],
  [1600, 1067],
]
const TEXTS = [
  'kubectl apply -f joy',
  'Best keynote of the year!',
  'Coffee #3 and counting',
  'Hello from the eBPF room 🐝',
  'Day 1 ☁️',
  'Met my GitHub mentor IRL',
  '',
  'Platform engineering squad',
  'That demo actually worked',
  'Fjord views between talks',
  '',
  'Stickers acquired',
  'Ask me about OpenTelemetry',
  'Waffles > YAML',
  'First conference talk done!',
  '',
  'CNCF ambassadors assemble',
  'Hallway track is the best track',
  'Lightning talks 🔥',
  'Bergen sends its regards',
  'Workshop: done. Brain: full.',
  '',
  'See you next year!',
  'Team photo, take 7',
]
const NAMES = [
  'Ingrid',
  '',
  'Lars B.',
  'Sofia',
  '',
  'Ahmed',
  'Kari',
  'Platform team',
  '',
  'Ole',
  'Mia',
  '',
]
const FILTER_CYCLE: FilterKey[] = [
  'original',
  'vivid',
  'warm',
  'fjord',
  'original',
  'mono',
  'fade',
  'aurora',
  'retro',
  'noir',
]

function makePost(id: number): Post {
  const [w, h] = SIZES[id % SIZES.length]
  return {
    id,
    photo: `https://picsum.photos/seed/cndn-pw-${id}/${Math.round(w / 2)}/${Math.round(h / 2)}`,
    w,
    h,
    filter: FILTER_CYCLE[id % FILTER_CYCLE.length],
    text: TEXTS[id % TEXTS.length],
    name: NAMES[id % NAMES.length],
    minutesAgo: id * 4,
  }
}

const INITIAL = Array.from({ length: 24 }, (_, i) => makePost(24 - i))
const WALL_URL = 'cloudnativedays.no/wall'

/** Deterministic pseudo-random in [-1, 1] per id and salt. */
const jitter = (id: number, salt: number) => {
  const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

// ---------------------------------------------------------------------------
// Live simulation shared by every look
// ---------------------------------------------------------------------------

const ADVANCE_MS = 6000 // idle rotation / spotlight pacing
const ARRIVAL_GAP_MS = 2500 // a burst is let in one post at a time
const HIGHLIGHT_MS = 6000 // how long a new post wears its "new" mark

function useWallSim() {
  const [posts, setPosts] = useState<Post[]>(INITIAL)
  const [queue, setQueue] = useState<Post[]>([])
  const [fresh, setFresh] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [paused, setPaused] = useState(false)
  const nextId = useRef(100)

  const approve = useCallback((n = 1) => {
    const batch = Array.from({ length: n }, () => {
      nextId.current += 1
      return { ...makePost(nextId.current), minutesAgo: 0 }
    })
    setQueue((q) => [...q, ...batch])
  }, [])

  useEffect(() => {
    if (queue.length === 0) return
    const t = setTimeout(
      () => {
        const [head, ...rest] = queue
        setPosts((p) => [head, ...p])
        setFresh(head.id)
        setQueue(rest)
      },
      fresh === null ? 300 : ARRIVAL_GAP_MS,
    )
    return () => clearTimeout(t)
  }, [queue, fresh])

  useEffect(() => {
    if (fresh === null) return
    const t = setTimeout(() => setFresh(null), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [fresh])

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setTick((n) => n + 1), ADVANCE_MS)
    return () => clearInterval(t)
  }, [paused])

  const remove = (id: number) => setPosts((p) => p.filter((x) => x.id !== id))

  return {
    posts,
    queued: queue.length,
    fresh,
    tick,
    paused,
    setPaused,
    approve,
    remove,
  }
}

type Sim = ReturnType<typeof useWallSim>

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export type Look = 'A' | 'B' | 'C'
export type Mode = 'page' | 'screen'

const LOOK_NAMES: Record<Look, string> = {
  A: 'Polaroid pinboard',
  B: 'Modern mosaic',
  C: 'Spotlight + filmstrip',
}

function useQr(url: string) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(`https://${url}`, {
        width: 320,
        margin: 0,
        color: { dark: '#111827', light: '#ffffff' },
      }).then((d) => live && setSrc(d)),
    )
    return () => {
      live = false
    }
  }, [url])
  return src
}

function Photo({
  post,
  className = '',
  fit = 'cover',
  aspect = false,
}: {
  post: Post
  className?: string
  fit?: 'cover' | 'contain'
  /** Size the box to the photo's own aspect ratio. */
  aspect?: boolean
}) {
  const f = filterOf(post.filter)
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={aspect ? { aspectRatio: `${post.w} / ${post.h}` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={post.photo}
        alt={post.text || 'Photo from the wall'}
        className={`absolute inset-0 size-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        style={{ filter: f.css }}
      />
      {f.tint && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: f.tint, mixBlendMode: f.blend }}
        />
      )}
    </div>
  )
}

const asDraft = (p: Post) => ({
  ...EMPTY_DRAFT,
  photo: p.photo,
  filter: p.filter,
  text: p.text,
  name: p.name,
})

const ago = (m: number) =>
  m === 0 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`

function Brand({
  dark = true,
  compact = false,
}: {
  dark?: boolean
  compact?: boolean
}) {
  if (compact)
    return (
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-brand-cloud-blue text-[10px] font-bold text-white">
          CN
        </span>
        <p className="font-bold">Photo Wall</p>
      </div>
    )
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-lg bg-brand-cloud-blue text-sm font-bold text-white">
        CN
      </span>
      <div className={dark ? 'text-white' : ''}>
        <p className="text-xl leading-tight font-bold">Photo Wall</p>
        <p
          className={`text-sm ${dark ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'}`}
        >
          Cloud Native Days Norway 2026
        </p>
      </div>
    </div>
  )
}

function QrCta({ variant }: { variant: 'card' | 'polaroid' }) {
  const qr = useQr(WALL_URL)
  if (variant === 'polaroid')
    return (
      <figure className="w-60 rotate-2 bg-white p-3 pb-2 text-gray-900 shadow-2xl">
        <div className="grid aspect-square place-items-center bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="" className="block h-auto w-full" />}
        </div>
        <figcaption className="pt-2 text-center font-['Caveat',cursive] text-2xl leading-tight">
          Add yours! <span className="text-gray-500">{WALL_URL}</span>
        </figcaption>
      </figure>
    )
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-4 text-gray-900 shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="" className="block size-28 shrink-0" />}
      <div>
        <p className="text-2xl font-bold">Add your photo</p>
        <p className="mt-1 text-gray-500">Scan, snap, post</p>
        <p className="mt-2 font-mono text-sm text-brand-cloud-blue">
          {WALL_URL}
        </p>
      </div>
    </div>
  )
}

function NewBadge({ label = 'New' }: { label?: string }) {
  return (
    <span className="animate-[pw-pop_400ms_ease-out] rounded-full bg-brand-sunbeam-yellow px-3 py-1 text-sm font-bold text-gray-900 shadow-lg">
      {label}
    </span>
  )
}

/** Phone Wall page chrome: header, count, sticky "Add your photo". */
function PageShell({
  sim,
  children,
  tone = 'plain',
}: {
  sim: Sim
  children: React.ReactNode
  tone?: 'plain' | 'board'
}) {
  return (
    <div
      className={`min-h-screen pb-28 ${tone === 'board' ? 'bg-stone-200 dark:bg-stone-900' : 'bg-white dark:bg-gray-950'} text-gray-900 dark:text-gray-100`}
    >
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-gray-950/90">
        <Brand dark={false} compact />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {sim.posts.length} photos
        </span>
      </header>
      {children}
      <div className="fixed inset-x-4 bottom-16 z-30">
        <a
          href="#add"
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-cloud-blue px-4 py-3.5 font-semibold text-white shadow-lg"
        >
          <PlusIcon className="size-5" /> Add your photo
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A — Polaroid pinboard
// ---------------------------------------------------------------------------

const A_COLS = 6
const A_ROWS = 3
const A_SLOTS = A_COLS * A_ROWS - 1 // the last slot holds the QR polaroid

function LookAScreen({ sim }: { sim: Sim }) {
  // slot -> post id; new posts take the slot of the oldest card on the board
  const [slots, setSlots] = useState<number[]>(() =>
    sim.posts.slice(0, A_SLOTS).map((p) => p.id),
  )
  const [placedAt, setPlacedAt] = useState<Record<number, number>>({})
  const [z, setZ] = useState(1)
  const byId = useMemo(
    () => new Map(sim.posts.map((p) => [p.id, p])),
    [sim.posts],
  )

  // new arrival: replace the oldest visible card
  useEffect(() => {
    if (sim.fresh === null || slots.includes(sim.fresh)) return
    setSlots((s) => {
      const oldest = s.reduce(
        (best, id, i) =>
          (byId.get(id)?.minutesAgo ?? 1e9) >
          (byId.get(s[best])?.minutesAgo ?? -1)
            ? i
            : best,
        0,
      )
      const next = [...s]
      next[oldest] = sim.fresh!
      return next
    })
    setZ((n) => n + 1)
    setPlacedAt((m) => ({ ...m, [sim.fresh!]: z + 1 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.fresh])

  // removal: an empty slot is refilled from the archive
  // idle tick: one slot swaps to an archived post
  useEffect(() => {
    setSlots((s) => {
      const shown = new Set(s)
      const archive = sim.posts.filter((p) => !shown.has(p.id))
      let next = s.map((id) =>
        byId.has(id) ? id : (archive.shift()?.id ?? id),
      )
      if (sim.tick > 0 && archive.length > 0) {
        const slot = Math.abs(Math.round(jitter(sim.tick, 3) * 1000)) % s.length
        if (next[slot] !== sim.fresh) {
          next = [...next]
          next[slot] = archive[sim.tick % archive.length].id
        }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.tick, sim.posts])

  return (
    <div
      className="relative size-full overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at center, #57534e 0%, #292524 70%)',
      }}
    >
      <div className="absolute top-8 left-10 z-[200]">
        <Brand />
      </div>
      {slots.map((id, i) => {
        const post = byId.get(id)
        if (!post) return null
        const col = i % A_COLS
        const row = Math.floor(i / A_COLS)
        const left = 60 + col * 300 + jitter(id, 1) * 24
        const top = 120 + row * 310 + jitter(id, 2) * 18
        const isFresh = sim.fresh === id
        return (
          <div
            key={`${i}-${id}`}
            className={`absolute w-[230px] ${isFresh ? 'animate-[pw-drop_900ms_cubic-bezier(.2,.8,.2,1.1)]' : 'animate-[pw-fade_1200ms_ease-out]'}`}
            style={{ left, top, zIndex: placedAt[id] ?? 1 }}
          >
            <Polaroid draft={asDraft(post)} tilt={jitter(id, 4) * 6} />
            {isFresh && (
              <div className="absolute -top-3 -right-3">
                <NewBadge />
              </div>
            )}
          </div>
        )
      })}
      <div className="absolute right-12 bottom-10 z-[150]">
        <QrCta variant="polaroid" />
      </div>
    </div>
  )
}

function LookAPage({ sim }: { sim: Sim }) {
  return (
    <PageShell sim={sim} tone="board">
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 pt-5">
        {sim.posts.slice(0, 16).map((post) => (
          <div
            key={post.id}
            className={`relative ${sim.fresh === post.id ? 'animate-[pw-drop_900ms_cubic-bezier(.2,.8,.2,1.1)]' : ''}`}
          >
            <Polaroid
              draft={asDraft(post)}
              tilt={jitter(post.id, 4) * 3}
              small
            />
            {sim.fresh === post.id && (
              <div className="absolute -top-2 -right-1">
                <NewBadge />
              </div>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// B — Modern mosaic
// ---------------------------------------------------------------------------

function Mosaic({
  sim,
  cols,
  colWidth,
  square,
  spotlight,
  captionSize,
}: {
  sim: Sim
  cols: number
  colWidth: number
  square: boolean
  spotlight: boolean
  captionSize: 'sm' | 'lg'
}) {
  const ROW = 8
  const recent = sim.posts.slice(0, 6)
  const spot = spotlight
    ? (sim.posts.find((p) => p.id === sim.fresh) ??
      recent[sim.tick % recent.length])
    : null
  const ordered = spot
    ? [spot, ...sim.posts.filter((p) => p.id !== spot.id)]
    : sim.posts
  return (
    <div
      className="grid grid-flow-row-dense gap-1"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: ROW,
      }}
    >
      {ordered.map((post) => {
        const isSpot = spot?.id === post.id
        const span = isSpot ? 2 : 1
        const ratio = square ? 1 : post.h / post.w
        const rows = Math.round((colWidth * span * ratio + 4) / (ROW + 4))
        const isFresh = sim.fresh === post.id
        return (
          <figure
            key={post.id}
            className={`group relative overflow-hidden rounded-md ${isFresh ? 'animate-[pw-glow_1600ms_ease-out] ring-4 ring-brand-sunbeam-yellow' : ''} ${isSpot ? 'z-10' : ''}`}
            style={{
              gridColumn: `span ${span}`,
              gridRow: `span ${rows}`,
            }}
          >
            <Photo post={post} className="size-full" />
            {(isSpot || captionSize === 'sm') && (post.text || post.name) && (
              <figcaption
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent text-white ${isSpot && captionSize === 'lg' ? 'p-6 pt-16' : 'p-2 pt-8'}`}
              >
                {post.text && (
                  <p
                    className={
                      isSpot && captionSize === 'lg'
                        ? 'text-3xl font-bold'
                        : 'text-xs font-semibold'
                    }
                  >
                    {post.text}
                  </p>
                )}
                {post.name && (
                  <p
                    className={`text-white/70 ${isSpot && captionSize === 'lg' ? 'mt-1 text-lg' : 'text-[11px]'}`}
                  >
                    {post.name}
                  </p>
                )}
              </figcaption>
            )}
            {isFresh && (
              <div className="absolute top-3 left-3">
                <NewBadge label="Just posted" />
              </div>
            )}
          </figure>
        )
      })}
    </div>
  )
}

function LookBScreen({ sim, square }: { sim: Sim; square: boolean }) {
  return (
    <div className="relative size-full overflow-hidden bg-black p-1">
      <Mosaic
        sim={sim}
        cols={7}
        colWidth={272}
        square={square}
        spotlight
        captionSize="lg"
      />
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between bg-gradient-to-t from-black via-black/70 to-transparent px-10 pt-24 pb-8">
        <Brand />
        <QrCta variant="card" />
      </div>
    </div>
  )
}

function LookBPage({ sim, square }: { sim: Sim; square: boolean }) {
  return (
    <PageShell sim={sim}>
      <div className="p-1">
        <Mosaic
          sim={sim}
          cols={2}
          colWidth={193}
          square={square}
          spotlight={false}
          captionSize="sm"
        />
      </div>
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// C — Spotlight + filmstrip
// ---------------------------------------------------------------------------

function useHero(sim: Sim) {
  // the hero walks the 12 most recent posts; a new post is shown next
  const [heroId, setHeroId] = useState(sim.posts[0]?.id)
  const [jumpTo, setJumpTo] = useState<number | null>(null)
  useEffect(() => {
    if (sim.fresh !== null && sim.fresh !== heroId) setJumpTo(sim.fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.fresh])
  const recent = sim.posts.slice(0, 12)
  const at = Math.max(
    0,
    recent.findIndex((p) => p.id === heroId),
  )
  useEffect(() => {
    if (sim.tick === 0) return
    if (jumpTo !== null) {
      setHeroId(jumpTo)
      setJumpTo(null)
    } else setHeroId(recent[(at + 1) % recent.length]?.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.tick])
  const hero = sim.posts.find((p) => p.id === heroId) ?? sim.posts[0]
  const rotation = [...recent.slice(at + 1), ...recent.slice(0, at)]
  const upNext = [
    ...rotation.filter((p) => p.id === jumpTo),
    ...rotation.filter((p) => p.id !== jumpTo && p.id !== hero?.id),
  ].slice(0, 4)
  return { hero, upNext }
}

function LookCScreen({ sim }: { sim: Sim }) {
  const { hero, upNext } = useHero(sim)
  if (!hero) return null
  return (
    <div className="relative size-full overflow-hidden bg-gray-950 text-white">
      <div className="absolute inset-0 scale-110 opacity-50 blur-3xl">
        <Photo post={hero} className="size-full" />
      </div>
      <div className="relative grid size-full grid-cols-[1fr_420px] gap-10 p-10">
        <div
          key={hero.id}
          className="flex min-h-0 animate-[pw-fade_900ms_ease-out] flex-col"
        >
          <Photo
            post={hero}
            fit="contain"
            className="min-h-0 flex-1 drop-shadow-2xl"
          />
          <div className="mt-6 flex items-end justify-between gap-8">
            <div>
              {hero.text && (
                <p className="text-5xl leading-tight font-bold">{hero.text}</p>
              )}
              <p className="mt-2 text-2xl text-white/60">
                {hero.name || 'Anonymous'} · {ago(hero.minutesAgo)}
              </p>
            </div>
            {sim.fresh === hero.id && <NewBadge label="Just in" />}
          </div>
          <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/15">
            <div
              key={`${hero.id}-${sim.tick}`}
              className="h-full animate-[pw-progress_6000ms_linear] bg-white/70"
              style={{ animationPlayState: sim.paused ? 'paused' : 'running' }}
            />
          </div>
        </div>
        <aside className="flex min-h-0 flex-col gap-6">
          <Brand />
          <QrCta variant="card" />
          <p className="text-sm font-semibold tracking-widest text-white/50 uppercase">
            Up next
          </p>
          <ul className="flex min-h-0 flex-col gap-3">
            {upNext.map((p) => (
              <li key={p.id} className="flex items-center gap-4">
                <Photo post={p} className="size-20 shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">
                    {p.text || 'Photo'}
                  </p>
                  <p className="text-sm text-white/50">
                    {p.name || 'Anonymous'}
                  </p>
                </div>
                {sim.fresh === p.id && <NewBadge />}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}

function LookCPage({ sim }: { sim: Sim }) {
  return (
    <PageShell sim={sim}>
      <ul className="divide-y divide-gray-100 dark:divide-gray-900">
        {sim.posts.slice(0, 10).map((post) => (
          <li
            key={post.id}
            className={`pb-4 ${sim.fresh === post.id ? 'animate-[pw-fade_900ms_ease-out]' : ''}`}
          >
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-semibold">{post.name || 'Anonymous'}</span>
              <span className="flex items-center gap-1 text-gray-500">
                {sim.fresh === post.id ? (
                  <NewBadge />
                ) : (
                  <>
                    <ClockIcon className="size-4" />
                    {ago(post.minutesAgo)}
                  </>
                )}
              </span>
            </div>
            <Photo post={post} className="w-full" aspect />
            {post.text && <p className="px-4 pt-3">{post.text}</p>}
          </li>
        ))}
      </ul>
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Root, switcher and prototype panel
// ---------------------------------------------------------------------------

export interface WallLookPrototypeProps {
  look: Look
  mode: Mode
  square?: boolean
  /** Fire one approval shortly after mount (for screenshots of "new"). */
  arriveOnMount?: boolean
  hideChrome?: boolean
}

/** Renders a 1920×1080 venue screen, scaled to fit whatever viewport shows it. */
function ScreenFit({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div
        className="absolute top-0 left-0 origin-top-left overflow-hidden"
        style={{ width: 1920, height: 1080, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}

const KEYFRAMES = `
@keyframes pw-drop { 0% { transform: translateY(-140px) scale(1.35) rotate(-8deg); opacity: 0 } 60% { opacity: 1 } 100% { transform: none; opacity: 1 } }
@keyframes pw-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pw-pop { 0% { transform: scale(.4) } 70% { transform: scale(1.15) } 100% { transform: scale(1) } }
@keyframes pw-glow { 0% { box-shadow: 0 0 0 0 rgba(250,204,21,.9) } 100% { box-shadow: 0 0 0 40px rgba(250,204,21,0) } }
@keyframes pw-progress { from { width: 0 } to { width: 100% } }
`

export function WallLookPrototype(props: WallLookPrototypeProps) {
  const [look, setLook] = useState<Look>(props.look)
  const [mode, setMode] = useState<Mode>(props.mode)
  const [square, setSquare] = useState(props.square ?? false)
  const sim = useWallSim()

  useEffect(() => {
    if (!props.arriveOnMount) return
    const t = setTimeout(() => sim.approve(1), 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const body =
    mode === 'screen' ? (
      <ScreenFit>
        {look === 'A' && <LookAScreen sim={sim} />}
        {look === 'B' && <LookBScreen sim={sim} square={square} />}
        {look === 'C' && <LookCScreen sim={sim} />}
      </ScreenFit>
    ) : (
      <>
        {look === 'A' && <LookAPage sim={sim} />}
        {look === 'B' && <LookBPage sim={sim} square={square} />}
        {look === 'C' && <LookCPage sim={sim} />}
      </>
    )

  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap"
        precedence="default"
      />
      <style>{KEYFRAMES}</style>
      {body}
      {!props.hideChrome && (
        <PrototypeBar
          look={look}
          setLook={setLook}
          mode={mode}
          setMode={setMode}
          square={square}
          setSquare={setSquare}
          sim={sim}
        />
      )}
    </>
  )
}

function PrototypeBar({
  look,
  setLook,
  mode,
  setMode,
  square,
  setSquare,
  sim,
}: {
  look: Look
  setLook: (l: Look) => void
  mode: Mode
  setMode: (m: Mode) => void
  square: boolean
  setSquare: (s: boolean) => void
  sim: Sim
}) {
  const order: Look[] = ['A', 'B', 'C']
  const go = useCallback(
    (d: number) => setLook(order[(order.indexOf(look) + d + 3) % 3]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [look, setLook],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest('input, textarea, [contenteditable]')
      )
        return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])
  const [open, setOpen] = useState(false)
  const btn = 'rounded-full px-2.5 py-1 hover:bg-white/20'
  return (
    <div className="fixed bottom-3 left-1/2 z-[999] flex -translate-x-1/2 flex-col items-center gap-1 text-xs font-semibold text-white">
      {open && (
        <div className="flex max-w-[92vw] flex-wrap justify-center gap-1 rounded-2xl bg-fuchsia-600 p-1 shadow-xl">
          <button type="button" className={btn} onClick={() => sim.approve(1)}>
            + Approve
          </button>
          <button type="button" className={btn} onClick={() => sim.approve(5)}>
            + Burst of 5{sim.queued > 0 ? ` (${sim.queued} queued)` : ''}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => sim.posts[0] && sim.remove(sim.posts[0].id)}
          >
            Remove newest
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => sim.setPaused(!sim.paused)}
          >
            {sim.paused ? 'Play' : 'Pause'}
          </button>
          {look === 'B' && (
            <button
              type="button"
              className={btn}
              onClick={() => setSquare(!square)}
            >
              {square ? 'Square crops' : 'Original shapes'}
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-1 rounded-full bg-fuchsia-600 p-1 whitespace-nowrap shadow-xl">
        <button
          type="button"
          onClick={() => go(-1)}
          className={btn}
          aria-label="Previous look"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="px-1 whitespace-nowrap">
          {look}
          <span className="hidden sm:inline"> · {LOOK_NAMES[look]}</span>
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          className={btn}
          aria-label="Next look"
        >
          <ChevronRightIcon className="size-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-white/30" />
        <button
          type="button"
          className={btn}
          onClick={() => setMode(mode === 'page' ? 'screen' : 'page')}
        >
          {mode === 'page' ? 'Phone page' : 'Screen Mode'}
        </button>
        <button type="button" className={btn} onClick={() => setOpen(!open)}>
          {open ? 'Hide sim' : 'Simulate'}
        </button>
      </div>
    </div>
  )
}
