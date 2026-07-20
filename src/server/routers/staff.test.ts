import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// Sanity write client: capture create/patch/delete.
const createMock = vi.fn()
const deleteMock = vi.fn()
const commitMock = vi.fn()
let lastPatchId: string | undefined
let lastSet: Record<string, unknown> | undefined
let lastUnset: string[] | undefined

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    create: (doc: Record<string, unknown>) => createMock(doc),
    delete: (id: string) => deleteMock(id),
    patch: (id: string) => {
      lastPatchId = id
      const builder = {
        set: (obj: Record<string, unknown>) => {
          lastSet = { ...(lastSet ?? {}), ...obj }
          return builder
        },
        unset: (keys: string[]) => {
          lastUnset = keys
          return builder
        },
        commit: () => commitMock(),
      }
      return builder
    },
  },
}))

// Admin list reads through the data layer.
const getAllStaffMock = vi.fn()
vi.mock('@/lib/staff/sanity', () => ({
  getAllStaffMembers: () => getAllStaffMock(),
}))

import { staffRouter } from './staff'

function makeCaller(isOrganizer = true) {
  const speaker = { _id: 'sp-1', name: 'Org', isOrganizer }
  const ctx = {
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context
  return staffRouter.createCaller(ctx)
}

const validCreate = {
  name: 'Ada Lovelace',
  role: 'organizer',
  link: 'https://example.com/ada',
}

beforeEach(() => {
  vi.clearAllMocks()
  lastPatchId = undefined
  lastSet = undefined
  lastUnset = undefined
  createMock.mockResolvedValue({ _id: 'staff-new' })
  deleteMock.mockResolvedValue({})
  commitMock.mockResolvedValue({ _id: 'staff-1' })
  getAllStaffMock.mockResolvedValue([])
})

describe('staff router — authorization', () => {
  it('rejects a non-organizer (FORBIDDEN)', async () => {
    await expect(makeCaller(false).create(validCreate)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('staff router — create', () => {
  it('creates a staff doc with required fields', async () => {
    const result = await makeCaller().create(validCreate)
    expect(createMock).toHaveBeenCalledTimes(1)
    const doc = createMock.mock.calls[0][0]
    expect(doc._type).toBe('staff')
    expect(doc.name).toBe('Ada Lovelace')
    expect(doc.role).toBe('organizer')
    expect(doc.link).toBe('https://example.com/ada')
    expect(doc).not.toHaveProperty('image')
    expect(result._id).toBe('staff-new')
  })

  it('stores the image as an asset reference when provided', async () => {
    await makeCaller().create({
      ...validCreate,
      image: 'image-abc-200x200-png',
      email: 'ada@example.com',
      company: 'Analytical Engines',
    })
    const doc = createMock.mock.calls[0][0]
    expect(doc.image).toEqual({
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-abc-200x200-png' },
    })
    expect(doc.email).toBe('ada@example.com')
    expect(doc.company).toBe('Analytical Engines')
  })

  it('rejects a missing name', async () => {
    await expect(
      makeCaller().create({ ...validCreate, name: '' }),
    ).rejects.toBeTruthy()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid link URL', async () => {
    await expect(
      makeCaller().create({ ...validCreate, link: 'not-a-url' }),
    ).rejects.toBeTruthy()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rejects an image that is not a Sanity asset id', async () => {
    await expect(
      makeCaller().create({ ...validCreate, image: 'https://cdn/x.png' }),
    ).rejects.toBeTruthy()
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('staff router — update', () => {
  it('patches only provided fields', async () => {
    await makeCaller().update({ id: 'staff-1', name: 'Grace Hopper' })
    expect(lastPatchId).toBe('staff-1')
    expect(lastSet).toEqual({ name: 'Grace Hopper' })
    expect(lastUnset).toBeUndefined()
  })

  it('unsets optional fields sent as null', async () => {
    await makeCaller().update({ id: 'staff-1', email: null, company: null })
    expect(lastUnset).toEqual(['email', 'company'])
    expect(commitMock).toHaveBeenCalledTimes(1)
  })

  it('unsets the image when sent as null', async () => {
    await makeCaller().update({ id: 'staff-1', image: null })
    expect(lastUnset).toEqual(['image'])
  })

  it('sets a new image asset reference', async () => {
    await makeCaller().update({ id: 'staff-1', image: 'image-xyz-100x100-png' })
    expect(lastSet).toEqual({
      image: {
        _type: 'image',
        asset: { _type: 'reference', _ref: 'image-xyz-100x100-png' },
      },
    })
  })

  it('rejects an update with nothing to change', async () => {
    await expect(makeCaller().update({ id: 'staff-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('staff router — delete (unguarded)', () => {
  it('deletes without any reference check', async () => {
    const result = await makeCaller().delete({ id: 'staff-1' })
    expect(result.success).toBe(true)
    expect(deleteMock).toHaveBeenCalledWith('staff-1')
  })
})
