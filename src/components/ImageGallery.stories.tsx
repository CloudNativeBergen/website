import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ImageGallery } from './ImageGallery'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

/**
 * Homepage photo-gallery band. Two variants: `carousel` (the default — one
 * auto-playing photo with controls) and `mosaic` (every featured photo at once,
 * in a masonry that keeps each photo's own aspect ratio, with no motion).
 *
 * The heading and description are per-section config on the `homepageGallery`
 * block — `Default` renders the built-in house copy (what every existing site
 * sees), `CustomCopy` a tenant override.
 */

/* ------------------------------------------------------------------ *
 * Photo fixtures.
 *
 * Conference photos, not grey rectangles: the mosaic lives or dies on
 * mixed aspect ratios, mixed exposure and busy frames, and a wall of
 * identical "Photo 3" placeholders would hide every one of those
 * problems. Each scene is drawn as a lit, vignetted SVG at a REAL photo
 * aspect ratio (16:9, 4:3, 3:2, 1:1, portrait 3:4 and 4:5) and served
 * through the Sanity CDN route the component actually requests.
 * ------------------------------------------------------------------ */

type Scene =
  | 'stage'
  | 'audience'
  | 'workshop'
  | 'hallway'
  | 'panel'
  | 'exterior'
  | 'party'
  | 'badge'

interface PhotoSpec {
  id: string
  scene: Scene
  width: number
  height: number
  alt: string
  photographer: string
}

const PHOTOS: PhotoSpec[] = [
  {
    id: 'gal1',
    scene: 'stage',
    width: 1920,
    height: 1080,
    alt: 'Opening keynote on the main stage',
    photographer: 'Ingrid Solberg',
  },
  {
    id: 'gal2',
    scene: 'audience',
    width: 1600,
    height: 1200,
    alt: 'A full room during the afternoon track',
    photographer: 'Ingrid Solberg',
  },
  {
    id: 'gal3',
    scene: 'workshop',
    width: 1200,
    height: 1600,
    alt: 'Hands-on Kubernetes workshop',
    photographer: 'Ola Berge',
  },
  {
    id: 'gal4',
    scene: 'hallway',
    width: 1800,
    height: 1200,
    alt: 'The hallway track over coffee',
    photographer: 'Ola Berge',
  },
  {
    id: 'gal5',
    scene: 'panel',
    width: 1920,
    height: 1080,
    alt: 'Closing panel on platform engineering',
    photographer: 'Ingrid Solberg',
  },
  {
    id: 'gal6',
    scene: 'exterior',
    width: 1400,
    height: 1400,
    alt: 'Grieghallen on the morning of day one',
    photographer: 'Marte Vik',
  },
  {
    id: 'gal7',
    scene: 'party',
    width: 1600,
    height: 1067,
    alt: 'The after-party at the venue bar',
    photographer: 'Marte Vik',
  },
  {
    id: 'gal8',
    scene: 'badge',
    width: 1200,
    height: 1500,
    alt: 'An attendee badge and lanyard at registration',
    photographer: 'Marte Vik',
  },
]

/**
 * Sanity asset ids are `image-<40 hex>-<w>x<h>-<ext>`; keep the shape, and make
 * the id itself unique per photo so the request handler below can tell two
 * same-sized frames apart.
 */
function assetRef(spec: PhotoSpec): string {
  const digit = spec.id.replace(/\D/g, '')
  return `image-${digit.repeat(40).slice(0, 40)}-${spec.width}x${spec.height}-jpg`
}

function galleryImage(spec: PhotoSpec): GalleryImageWithSpeakers {
  return {
    _id: spec.id,
    _rev: 'r1',
    _createdAt: '2025-06-12T10:00:00Z',
    _updatedAt: '2025-06-12T10:00:00Z',
    photographer: spec.photographer,
    date: '2025-06-12',
    location: 'Grieghallen, Bergen',
    featured: true,
    imageAlt: spec.alt,
    image: {
      _type: 'image',
      asset: { _ref: assetRef(spec), _type: 'reference' },
    },
    speakers: [],
  } as unknown as GalleryImageWithSpeakers
}

const featuredImages = PHOTOS.map(galleryImage)

/** A crowd of head-and-shoulders silhouettes along a baseline. */
function crowd(
  w: number,
  baseline: number,
  count: number,
  scale: number,
  fill: string,
  seed: number,
): string {
  let out = ''
  for (let i = 0; i < count; i++) {
    const jitter = ((i * seed) % 7) / 7
    const x = ((i + 0.5) / count) * w + (jitter - 0.5) * (w / count) * 0.6
    const r = scale * (0.85 + jitter * 0.3)
    out +=
      `<circle cx="${x.toFixed(0)}" cy="${(baseline - r * 1.6).toFixed(0)}" r="${r.toFixed(0)}" fill="${fill}"/>` +
      `<path d="M${(x - r * 2).toFixed(0)} ${baseline.toFixed(0)}c0-${(r * 1.9).toFixed(0)} ${(r * 1.1).toFixed(0)}-${(r * 2.6).toFixed(0)} ${(r * 2).toFixed(0)}-${(r * 2.6).toFixed(0)}s${(r * 2).toFixed(0)} ${(r * 0.7).toFixed(0)} ${(r * 2).toFixed(0)} ${(r * 2.6).toFixed(0)}Z" fill="${fill}"/>`
  }
  return out
}

/** Out-of-focus highlights — what a fast lens does to background lights. */
function bokeh(
  w: number,
  h: number,
  count: number,
  hue: number,
  seed: number,
): string {
  let out = ''
  for (let i = 0; i < count; i++) {
    const a = (i * seed) % 97
    const x = ((a * 37) % 100) / 100
    const y = ((a * 61) % 100) / 100
    const r = 12 + ((a * 13) % 60)
    const o = 0.12 + ((a * 7) % 30) / 100
    out += `<circle cx="${(x * w).toFixed(0)}" cy="${(y * h).toFixed(0)}" r="${r}" fill="hsl(${(hue + a * 3) % 360} 85% 70%)" opacity="${o.toFixed(2)}"/>`
  }
  return out
}

function sceneBody(scene: Scene, w: number, h: number): string {
  switch (scene) {
    case 'stage':
      return (
        `<rect width="${w}" height="${h}" fill="url(#sky)"/>` +
        `<ellipse cx="${w * 0.5}" cy="${h * 0.36}" rx="${w * 0.42}" ry="${h * 0.34}" fill="#1e3a8a" opacity="0.55" filter="url(#soft)"/>` +
        `<rect x="${w * 0.18}" y="${h * 0.1}" width="${w * 0.64}" height="${h * 0.44}" rx="${w * 0.006}" fill="url(#screen)"/>` +
        `<rect x="${w * 0.22}" y="${h * 0.18}" width="${w * 0.3}" height="${h * 0.045}" rx="6" fill="#ffffff" opacity="0.75"/>` +
        `<rect x="${w * 0.22}" y="${h * 0.27}" width="${w * 0.42}" height="${h * 0.022}" rx="4" fill="#ffffff" opacity="0.4"/>` +
        `<rect x="${w * 0.22}" y="${h * 0.32}" width="${w * 0.36}" height="${h * 0.022}" rx="4" fill="#ffffff" opacity="0.32"/>` +
        `<polygon points="${w * 0.28},0 ${w * 0.44},0 ${w * 0.36},${h}" fill="#ffffff" opacity="0.05"/>` +
        `<polygon points="${w * 0.6},0 ${w * 0.76},0 ${w * 0.72},${h}" fill="#ffffff" opacity="0.04"/>` +
        `<rect x="0" y="${h * 0.72}" width="${w}" height="${h * 0.28}" fill="#020617"/>` +
        `<circle cx="${w * 0.3}" cy="${h * 0.58}" r="${h * 0.055}" fill="#0b1220"/>` +
        `<path d="M${w * 0.24} ${h * 0.78}c0-${h * 0.13} ${w * 0.03}-${h * 0.17} ${w * 0.06}-${h * 0.17}s${w * 0.06} ${h * 0.04} ${w * 0.06} ${h * 0.17}Z" fill="#0b1220"/>` +
        `<rect x="${w * 0.62}" y="${h * 0.6}" width="${w * 0.07}" height="${h * 0.18}" rx="6" fill="#0b1220"/>` +
        crowd(w, h * 1.02, 9, h * 0.05, '#010409', 5)
      )
    case 'audience':
      return (
        `<rect width="${w}" height="${h}" fill="url(#warm)"/>` +
        `<rect x="0" y="0" width="${w}" height="${h * 0.4}" fill="#111827" opacity="0.25"/>` +
        bokeh(w, h * 0.4, 10, 35, 11) +
        crowd(w, h * 0.62, 12, h * 0.028, '#1f2937', 3) +
        crowd(w, h * 0.8, 9, h * 0.042, '#111827', 7) +
        crowd(w, h * 1.05, 6, h * 0.07, '#030712', 5) +
        `<rect x="${w * 0.14}" y="${h * 0.72}" width="${w * 0.1}" height="${h * 0.05}" rx="4" fill="#93c5fd" opacity="0.5"/>` +
        `<rect x="${w * 0.62}" y="${h * 0.7}" width="${w * 0.09}" height="${h * 0.045}" rx="4" fill="#bfdbfe" opacity="0.45"/>`
      )
    case 'workshop':
      return (
        `<rect width="${w}" height="${h}" fill="url(#room)"/>` +
        `<rect x="${w * 0.05}" y="${h * 0.08}" width="${w * 0.9}" height="${h * 0.2}" rx="10" fill="#e2e8f0" opacity="0.55"/>` +
        `<rect x="${w * 0.08}" y="${h * 0.5}" width="${w * 0.84}" height="${h * 0.06}" rx="8" fill="#a8a29e"/>` +
        `<rect x="${w * 0.08}" y="${h * 0.78}" width="${w * 0.84}" height="${h * 0.06}" rx="8" fill="#8b8683"/>` +
        `<g fill="#1e293b">` +
        `<rect x="${w * 0.16}" y="${h * 0.42}" width="${w * 0.18}" height="${h * 0.08}" rx="4"/>` +
        `<rect x="${w * 0.44}" y="${h * 0.42}" width="${w * 0.18}" height="${h * 0.08}" rx="4"/>` +
        `<rect x="${w * 0.7}" y="${h * 0.42}" width="${w * 0.16}" height="${h * 0.08}" rx="4"/>` +
        `</g>` +
        `<g fill="#7dd3fc" opacity="0.7">` +
        `<rect x="${w * 0.175}" y="${h * 0.435}" width="${w * 0.15}" height="${h * 0.06}" rx="2"/>` +
        `<rect x="${w * 0.455}" y="${h * 0.435}" width="${w * 0.15}" height="${h * 0.06}" rx="2"/>` +
        `</g>` +
        crowd(w, h * 0.42, 4, h * 0.035, '#334155', 3) +
        crowd(w, h * 0.72, 3, h * 0.05, '#1e293b', 9) +
        `<circle cx="${w * 0.86}" cy="${h * 0.74}" r="${h * 0.018}" fill="#fbbf24"/>`
      )
    case 'hallway':
      return (
        `<rect width="${w}" height="${h}" fill="url(#day)"/>` +
        `<g opacity="0.85">` +
        `<rect x="${w * 0.04}" y="${h * 0.06}" width="${w * 0.26}" height="${h * 0.62}" rx="6" fill="#e0f2fe"/>` +
        `<rect x="${w * 0.36}" y="${h * 0.06}" width="${w * 0.26}" height="${h * 0.62}" rx="6" fill="#dbeafe"/>` +
        `<rect x="${w * 0.68}" y="${h * 0.06}" width="${w * 0.26}" height="${h * 0.62}" rx="6" fill="#e0f2fe"/>` +
        `</g>` +
        `<rect x="0" y="${h * 0.68}" width="${w}" height="${h * 0.32}" fill="#a89f96"/>` +
        crowd(w, h * 0.78, 5, h * 0.045, '#475569', 3) +
        crowd(w, h * 1.02, 4, h * 0.085, '#1f2937', 7) +
        `<rect x="${w * 0.2}" y="${h * 0.68}" width="${w * 0.03}" height="${h * 0.05}" rx="3" fill="#f8fafc"/>` +
        `<rect x="${w * 0.71}" y="${h * 0.66}" width="${w * 0.028}" height="${h * 0.048}" rx="3" fill="#fef3c7"/>`
      )
    case 'panel':
      return (
        `<rect width="${w}" height="${h}" fill="url(#dusk)"/>` +
        `<rect x="${w * 0.1}" y="${h * 0.08}" width="${w * 0.8}" height="${h * 0.5}" rx="8" fill="#0f172a" opacity="0.7"/>` +
        `<rect x="${w * 0.16}" y="${h * 0.18}" width="${w * 0.36}" height="${h * 0.07}" rx="6" fill="#38bdf8" opacity="0.55"/>` +
        `<rect x="${w * 0.16}" y="${h * 0.29}" width="${w * 0.22}" height="${h * 0.04}" rx="4" fill="#e2e8f0" opacity="0.35"/>` +
        `<rect x="0" y="${h * 0.74}" width="${w}" height="${h * 0.26}" fill="#020617"/>` +
        `<g fill="#0b1220">` +
        `<circle cx="${w * 0.3}" cy="${h * 0.52}" r="${h * 0.06}"/>` +
        `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${h * 0.062}"/>` +
        `<circle cx="${w * 0.7}" cy="${h * 0.52}" r="${h * 0.06}"/>` +
        `<rect x="${w * 0.25}" y="${h * 0.58}" width="${w * 0.1}" height="${h * 0.18}" rx="${w * 0.02}"/>` +
        `<rect x="${w * 0.45}" y="${h * 0.56}" width="${w * 0.1}" height="${h * 0.2}" rx="${w * 0.02}"/>` +
        `<rect x="${w * 0.65}" y="${h * 0.58}" width="${w * 0.1}" height="${h * 0.18}" rx="${w * 0.02}"/>` +
        `</g>` +
        crowd(w, h * 1.04, 7, h * 0.06, '#010409', 5)
      )
    case 'exterior':
      return (
        `<rect width="${w}" height="${h}" fill="url(#sky2)"/>` +
        `<circle cx="${w * 0.78}" cy="${h * 0.18}" r="${h * 0.07}" fill="#fef9c3" opacity="0.85"/>` +
        `<ellipse cx="${w * 0.25}" cy="${h * 0.2}" rx="${w * 0.18}" ry="${h * 0.05}" fill="#ffffff" opacity="0.55"/>` +
        `<ellipse cx="${w * 0.42}" cy="${h * 0.15}" rx="${w * 0.12}" ry="${h * 0.035}" fill="#ffffff" opacity="0.4"/>` +
        `<rect x="${w * 0.08}" y="${h * 0.42}" width="${w * 0.36}" height="${h * 0.4}" fill="#94a3b8"/>` +
        `<rect x="${w * 0.46}" y="${h * 0.3}" width="${w * 0.44}" height="${h * 0.52}" fill="#64748b"/>` +
        `<g fill="#fcd34d" opacity="0.8">` +
        Array.from({ length: 18 })
          .map((_, i) => {
            const col = i % 6
            const row = Math.floor(i / 6)
            return `<rect x="${w * (0.5 + col * 0.062)}" y="${h * (0.36 + row * 0.11)}" width="${w * 0.04}" height="${h * 0.06}" rx="2" opacity="${0.35 + ((i * 7) % 6) / 10}"/>`
          })
          .join('') +
        `</g>` +
        `<rect x="0" y="${h * 0.82}" width="${w}" height="${h * 0.18}" fill="#4b5563"/>` +
        crowd(w, h * 0.96, 6, h * 0.028, '#1f2937', 3)
      )
    case 'party':
      return (
        `<rect width="${w}" height="${h}" fill="url(#night)"/>` +
        bokeh(w, h * 0.75, 18, 280, 13) +
        `<rect x="0" y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="#0b0713" opacity="0.85"/>` +
        crowd(w, h * 0.92, 7, h * 0.055, '#0a0a12', 5) +
        crowd(w, h * 1.08, 4, h * 0.085, '#050509', 3) +
        `<rect x="${w * 0.08}" y="${h * 0.62}" width="${w * 0.02}" height="${h * 0.09}" rx="4" fill="#fbbf24" opacity="0.7"/>` +
        `<rect x="${w * 0.84}" y="${h * 0.6}" width="${w * 0.02}" height="${h * 0.1}" rx="4" fill="#f472b6" opacity="0.6"/>`
      )
    case 'badge':
      return (
        `<rect width="${w}" height="${h}" fill="url(#room)"/>` +
        bokeh(w, h * 0.6, 12, 200, 7) +
        `<path d="M${w * 0.3} 0 ${w * 0.46} ${h * 0.34} ${w * 0.54} ${h * 0.34} ${w * 0.7} 0Z" fill="#1e3a8a" opacity="0.9"/>` +
        `<rect x="${w * 0.24}" y="${h * 0.33}" width="${w * 0.52}" height="${h * 0.42}" rx="${w * 0.03}" fill="#f8fafc"/>` +
        `<rect x="${w * 0.3}" y="${h * 0.38}" width="${w * 0.4}" height="${h * 0.035}" rx="6" fill="#1d4ed8" opacity="0.85"/>` +
        `<rect x="${w * 0.3}" y="${h * 0.46}" width="${w * 0.34}" height="${h * 0.05}" rx="6" fill="#0f172a"/>` +
        `<rect x="${w * 0.3}" y="${h * 0.54}" width="${w * 0.24}" height="${h * 0.03}" rx="4" fill="#64748b"/>` +
        `<rect x="${w * 0.3}" y="${h * 0.62}" width="${w * 0.16}" height="${h * 0.09}" rx="4" fill="#0f172a" opacity="0.12"/>` +
        `<rect x="${w * 0.56}" y="${h * 0.62}" width="${w * 0.14}" height="${h * 0.09}" rx="4" fill="#22c55e" opacity="0.35"/>` +
        `<rect x="0" y="${h * 0.8}" width="${w}" height="${h * 0.2}" fill="#111827" opacity="0.35"/>`
      )
  }
}

function photoSvg(spec: PhotoSpec): string {
  const { width: w, height: h, scene } = spec
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>` +
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1120"/><stop offset="1" stop-color="#020617"/></linearGradient>` +
    `<linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0e7490"/></linearGradient>` +
    `<linearGradient id="warm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c2d12"/><stop offset="0.5" stop-color="#431407"/><stop offset="1" stop-color="#1c1917"/></linearGradient>` +
    `<linearGradient id="room" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f5f9"/><stop offset="1" stop-color="#cbd5e1"/></linearGradient>` +
    `<linearGradient id="day" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#cbd5e1"/></linearGradient>` +
    `<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#172554"/><stop offset="1" stop-color="#020617"/></linearGradient>` +
    `<linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="0.6" stop-color="#bae6fd"/><stop offset="1" stop-color="#e2e8f0"/></linearGradient>` +
    `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e1065"/><stop offset="1" stop-color="#0b0713"/></linearGradient>` +
    `<filter id="soft"><feGaussianBlur stdDeviation="${Math.round(w * 0.03)}"/></filter>` +
    `<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.45"/></radialGradient>` +
    `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter>` +
    `</defs>` +
    sceneBody(scene, w, h) +
    `<rect width="${w}" height="${h}" fill="url(#vig)"/>` +
    `<rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.09"/>` +
    `</svg>`
  )
}

const handlers = [
  http.get('https://cdn.sanity.io/images/*', ({ request }) => {
    const path = new URL(request.url).pathname
    // The builder rewrites `image-<id>-<w>x<h>-jpg` to `<id>-<w>x<h>.jpg`, so
    // match on the asset id alone — it is unique per photo.
    const spec =
      PHOTOS.find((p) =>
        path.includes(p.id.replace(/\D/g, '').repeat(40).slice(0, 40)),
      ) ?? PHOTOS[0]
    return new HttpResponse(photoSvg(spec), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }),
]

const meta = {
  title: 'Systems/Homepage/Public/ImageGallery',
  component: ImageGallery,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Front-page photo band. `carousel` (default) auto-plays one photo at a time; `mosaic` shows every featured photo at once in a static masonry and opens the lightbox on click. Heading and description default to the house copy and are overridable per section (front-page builder).',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'radio',
      options: [undefined, 'carousel', 'mosaic'],
      description: 'Presentation variant. Absent = `carousel` (the default).',
    },
  },
  args: { featuredImages },
} satisfies Meta<typeof ImageGallery>

export default meta
type Story = StoryObj<typeof meta>

const darkDecorator: Decorator[] = [
  (Story) => (
    <div className="dark bg-gray-950">
      <Story />
    </div>
  ),
]

const dark = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: darkDecorator,
}

/* ---------------------------- carousel (default) ------------------------ */

/** House defaults — byte-identical to the pre-variant band. */
export const Default: Story = {}

export const DefaultDark: Story = { ...dark }

/** A tenant replacing the house copy with its own voice. */
export const CustomCopy: Story = {
  args: {
    heading: 'Photos from last year',
    description:
      'A look back at the 2025 edition — talks, hallway track and the after-party.',
  },
}

/* -------------------------------- mosaic -------------------------------- */

/**
 * `mosaic`: every featured photo visible at once, in a CSS-column masonry that
 * keeps each photo's own aspect ratio (no crop, no letterbox). No autoplay, no
 * timers, no previous/next controls — the skimmable option, and the honest one
 * for visitors who ask the platform for reduced motion. Clicking a tile opens
 * the same lightbox the carousel uses.
 */
export const Mosaic: Story = {
  args: { variant: 'mosaic' },
}

export const MosaicDark: Story = {
  ...dark,
  args: { variant: 'mosaic' },
}

/** Few photos: the masonry degrades to a short, tidy wall. */
export const MosaicFewImages: Story = {
  args: {
    variant: 'mosaic',
    featuredImages: featuredImages.slice(0, 3),
  },
}

export const MosaicCustomCopy: Story = {
  args: {
    variant: 'mosaic',
    heading: 'Photos from last year',
    description:
      'A look back at the 2025 edition — talks, hallway track and the after-party.',
  },
}
