/**
 * @vitest-environment node
 *
 * Save, leave, reopen (#1181): the editor's scenes go through the REAL stored
 * document builder, the REAL open projection (executed with groq-js over the
 * stored document and its file assets) and the REAL open mapping, and come
 * back as the scenes the editor started from — so the video previews
 * identically, asserted on the values the preview draws from.
 */
import { describe, expect, it } from 'vitest'
import { evaluate, parse } from 'groq-js'
import {
  OPEN_PROJECTION,
  openedProject,
  storedScenes,
  type ProjectRow,
} from '@/lib/video-project/document'
import { DEFAULT_DESIGN, type MemeDesign } from './meme-generator-draw'
import { newScene, type Scene } from './meme-generator-timeline'
import {
  carryFiles,
  fromProjectScenes,
  projectSnapshot,
  toProjectScenes,
} from './meme-generator-project'

const HALL = 'image-hall-3000x2000-jpg'
const HALL_CDN = 'https://cdn.sanity.io/images/p/d/hall-3000x2000.jpg'
const CROWD = 'image-crowd-2000x2000-png'
const CROWD_CDN = 'https://cdn.sanity.io/images/p/d/crowd-2000x2000.png'
/** What the studio draws each file from: the same-origin proxy. */
const drawn: Record<string, string> = {
  [HALL_CDN]: '/api/proxy-image?url=hall',
  [CROWD_CDN]: '/api/proxy-image?url=crowd',
}

function design(patch: Partial<MemeDesign> = {}): MemeDesign {
  return structuredClone({ ...DEFAULT_DESIGN, ...patch })
}

function scenes(): Scene[] {
  const a = newScene(
    design({
      background: {
        color: '#1D4ED8',
        image: {
          url: drawn[HALL_CDN],
          name: 'Keynote hall',
          galleryAssetId: 'asset-hall',
        },
      },
      qr: { ...DEFAULT_DESIGN.qr, url: 'https://example.com/program' },
    }),
  )
  a.duration = 2.7
  a.transition = 'zoom'
  // Inserted out of order: the round trip must not care.
  a.motion = {
    drift: true,
    elements: {
      qr: { entrance: 'fade', exit: 'fade', enter: 1, leave: 2.7 },
      text0: { entrance: 'pop', exit: 'slide-up', enter: 0.2, leave: 2.1 },
      logo: { entrance: 'slide-up', exit: 'none', enter: 0, leave: 2.7 },
    },
  }
  const b = newScene(design({ background: { color: '#FACC15', image: null } }))
  b.design.textLines[1] = {
    ...b.design.textLines[1],
    text: 'Tickets on sale',
    textAlign: 'right',
    isBold: true,
  }
  b.transition = 'fade'
  const c = newScene(
    design({
      background: {
        color: '#000000',
        // Opened from an earlier save: holds its file, and its gallery
        // asset has since been deleted.
        image: {
          url: drawn[CROWD_CDN],
          name: 'Crowd',
          galleryAssetId: 'asset-gone',
          fileId: CROWD,
        },
      },
      logo: { size: 420, bottom: 12, right: 80, variant: 'gradient' },
    }),
  )
  return [a, b, c]
}

async function saveAndReopen(editor: Scene[]): Promise<Scene[]> {
  const mapped = toProjectScenes(editor)
  if (!('scenes' in mapped)) throw new Error('unkept')
  const stored = storedScenes(mapped.scenes, [
    { fileId: HALL, galleryAssetId: 'asset-hall', createdByGallery: true },
    null,
    { fileId: CROWD, galleryAssetId: 'asset-gone', createdByGallery: false },
  ])
  const dataset = [
    {
      _id: HALL,
      _type: 'sanity.imageAsset',
      url: HALL_CDN,
      metadata: { dimensions: { width: 3000, height: 2000 } },
    },
    {
      _id: CROWD,
      _type: 'sanity.imageAsset',
      url: CROWD_CDN,
      metadata: { dimensions: { width: 2000, height: 2000 } },
    },
    {
      _id: 'vp-1',
      _rev: 'rev-1',
      _type: 'videoProject',
      title: 'Teaser',
      scope: 'organization',
      formatVersion: 1,
      scenes: stored,
    },
  ]
  const row = (await (
    await evaluate(parse(`*[_id == "vp-1"][0]${OPEN_PROJECTION}`), { dataset })
  ).get()) as ProjectRow
  const opened = openedProject(row, (url) => drawn[url])
  return fromProjectScenes(opened.scenes)
}

describe('a saved project reopens as the video it was', () => {
  it('gives back the scenes the editor saved, each image by the file it holds', async () => {
    const editor = scenes()
    const reopened = await saveAndReopen(editor)
    const expected = structuredClone(editor)
    expected[0].design.background.image!.fileId = HALL
    expect(reopened).toEqual(expected)
    // Nothing a save would change has changed.
    expect(projectSnapshot('Teaser', reopened)).toBe(
      projectSnapshot('Teaser', editor),
    )
  })

  it('saves and reopens again unchanged', async () => {
    const once = await saveAndReopen(scenes())
    expect(await saveAndReopen(once)).toEqual(once)
  })
})

describe('toProjectScenes', () => {
  it('names the scenes whose background is an upload not in the gallery', () => {
    const list = scenes()
    for (const i of [0, 2])
      list[i].design.background.image = {
        url: 'data:image/png;base64,AAAA',
        name: 'photo.png',
      }
    expect(toProjectScenes(list)).toEqual({ unkept: [1, 3] })
  })

  it('never carries an image URL: references only', () => {
    const mapped = toProjectScenes(scenes())
    expect(JSON.stringify(mapped)).not.toContain('proxy-image')
  })
})

describe('carryFiles', () => {
  it('gives every scene drawing a saved image its file, and leaves others alone', () => {
    const list = scenes()
    const carried = carryFiles(list, new Map([[drawn[HALL_CDN], HALL]]))
    expect(carried[0].design.background.image?.fileId).toBe(HALL)
    expect(carried[1]).toBe(list[1])
    expect(carried[2]).toBe(list[2])
    expect(projectSnapshot('t', carried)).toBe(projectSnapshot('t', list))
  })
})

describe('projectSnapshot', () => {
  it('changes when another gallery entry of the same file is picked', () => {
    const list = scenes()
    const base = projectSnapshot('t', list)
    list[0].design.background.image = {
      ...list[0].design.background.image!,
      name: 'Same photo, other entry',
      galleryAssetId: 'asset-other',
    }
    expect(projectSnapshot('t', list)).not.toBe(base)
  })

  it('tells two uploads apart without carrying their bytes', () => {
    const list = scenes()
    const big = `data:image/png;base64,${'A'.repeat(200_000)}`
    list[0].design.background.image = { url: `${big}B`, name: 'a.png' }
    const one = projectSnapshot('t', list)
    expect(one.length).toBeLessThan(20_000)
    list[0].design.background.image = { url: `${big}C`, name: 'a.png' }
    expect(projectSnapshot('t', list)).not.toBe(one)
  })

  it('changes with the title and with anything drawn', () => {
    const list = scenes()
    const base = projectSnapshot('Teaser', list)
    expect(projectSnapshot('Teaser 2', list)).not.toBe(base)
    const moved = structuredClone(list)
    moved[1].design.textLines[0].verticalPosition += 1
    expect(projectSnapshot('Teaser', moved)).not.toBe(base)
  })
})
