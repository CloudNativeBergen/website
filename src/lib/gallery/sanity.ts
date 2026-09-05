import { groq } from 'next-sanity'
import {
  clientWrite,
  clientReadCached,
  clientReadUncached,
} from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import { logger } from '@/lib/logger'
import { GALLERY_CONSTANTS } from './constants'
import { publishSpeakerTaggedEvent } from './events'
import type {
  CreateGalleryImageInput,
  UpdateGalleryImageInput,
  GalleryImageWithSpeakers,
  GalleryImageFilter,
  GalleryImageResponse,
  Uploadable,
} from './types'

/**
 * Wrapper function for API parity - accepts file and data separately
 */
export function createGalleryImage(
  file: Uploadable,
  data: Omit<CreateGalleryImageInput, 'file'>,
): Promise<GalleryImageResponse>
/**
 * Upload image asset and create gallery image document
 */
export function createGalleryImage(
  input: CreateGalleryImageInput,
): Promise<GalleryImageResponse>
export async function createGalleryImage(
  fileOrInput: Uploadable | CreateGalleryImageInput,
  data?: Omit<CreateGalleryImageInput, 'file'>,
): Promise<GalleryImageResponse> {
  try {
    const input = data
      ? { file: fileOrInput as Uploadable, ...data }
      : (fileOrInput as CreateGalleryImageInput)

    const {
      file,
      photographer,
      date,
      location,
      conference,
      featured = false,
      speakers = [],
      imageAlt,
    } = input

    if (!photographer || !date || !location || !conference) {
      const missingFields = []
      if (!photographer) missingFields.push('photographer')
      if (!date) missingFields.push('date')
      if (!location) missingFields.push('location')
      if (!conference) missingFields.push('conference')
      logger.error('Missing required fields for gallery image', {
        missingFields,
      })
      return {
        error: `Missing required fields: ${missingFields.join(', ')}`,
        status: 400,
      }
    }

    let assetRef
    if ((file as { _type?: string })?._type === 'reference') {
      assetRef = file as { _type: 'reference'; _ref: string }
    } else {
      try {
        const uploadedAsset = await clientWrite.assets.upload(
          'image',
          file as Uploadable,
          {
            filename: (file as File).name || 'image',
            contentType: (file as File).type || 'image/jpeg',
          },
        )
        assetRef = createReference(uploadedAsset._id)
      } catch (uploadError) {
        logger.error('Failed to upload asset to Sanity', {
          error:
            uploadError instanceof Error
              ? uploadError.message
              : 'Unknown error',
          filename: (file as File).name,
        })
        return {
          error: 'Failed to upload image to storage',
          status: 500,
        }
      }
    }

    const document = {
      _type: 'imageGallery',
      image: {
        _type: 'image',
        asset: assetRef,
        ...(imageAlt ? { alt: imageAlt } : {}),
      },
      photographer,
      date,
      location,
      conference: createReference(conference),
      featured,
      speakers: Array.from(new Set(speakers))
        .filter(Boolean)
        .map((speakerId) => ({
          ...createReference(speakerId),
          _key: `speaker-${speakerId}`,
        })),
    }

    const created = await clientWrite.create(document)

    const image = await getGalleryImage(created._id, conference)

    if (image && speakers.length > 0) {
      await publishSpeakerTaggedEvent(image, speakers)
    }

    return { image: image || undefined }
  } catch (error) {
    logger.error('Error creating gallery image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create gallery image',
      status: 500,
    }
  }
}

/**
 * Update an existing gallery image.
 *
 * TENANT SCOPING (#616): `conferenceId` is the REQUEST's conference, already
 * proven to own `id` by the router's `requireImageInConference` guard. The by-id
 * read below carries the predicate too — two independent controls, and a
 * foreign id refuses with the same 404 as a nonexistent one.
 */
export async function updateGalleryImage(
  id: string,
  patch: UpdateGalleryImageInput,
  conferenceId: string,
): Promise<GalleryImageResponse> {
  try {
    let originalSpeakerIds: string[] = []
    let untaggedSpeakerIds: string[] = []
    if (patch.speakers !== undefined) {
      const original = await clientReadUncached.fetch<{
        speakers?: Array<{ _ref: string }>
        untaggedSpeakers?: Array<{ _ref: string }>
      } | null>(
        groq`*[_type == "imageGallery" && conference._ref == $conferenceId && _id == $id][0]{ speakers, untaggedSpeakers }`,
        { id, conferenceId },
      )
      if (!original) {
        // Foreign or nonexistent — indistinguishable by design.
        return { error: 'Gallery image not found', status: 404 }
      }
      originalSpeakerIds = (original.speakers || []).map((s) => s._ref)
      untaggedSpeakerIds = (original.untaggedSpeakers || []).map((s) => s._ref)
    }

    const updatePatch: Record<string, unknown> = {}

    if (patch.photographer !== undefined)
      updatePatch.photographer = patch.photographer
    if (patch.date !== undefined) updatePatch.date = patch.date
    if (patch.location !== undefined) updatePatch.location = patch.location
    if (patch.conference !== undefined)
      updatePatch.conference = createReference(patch.conference)
    if (patch.featured !== undefined) updatePatch.featured = patch.featured
    if (patch.speakers !== undefined) {
      const requestedSpeakers = Array.from(new Set(patch.speakers)).filter(
        Boolean,
      )

      // Filter out speakers who have previously untagged themselves from this image.
      // This respects user privacy choices - once a speaker untags themselves,
      // they cannot be re-tagged in that photo (GDPR "right to object").
      const allowedSpeakers = requestedSpeakers.filter(
        (speakerId) => !untaggedSpeakerIds.includes(speakerId),
      )

      if (requestedSpeakers.length !== allowedSpeakers.length) {
        const blockedCount = requestedSpeakers.length - allowedSpeakers.length
        logger.warn('Some speakers blocked from being re-tagged', {
          imageId: id,
          blockedCount,
          requestedCount: requestedSpeakers.length,
        })
      }

      updatePatch.speakers = allowedSpeakers.map((speakerId) => ({
        ...createReference(speakerId),
        _key: `speaker-${speakerId}`,
      }))
    }

    if (patch.file) {
      const assetRef =
        (patch.file as { _type?: string })._type === 'reference'
          ? (patch.file as { _type: 'reference'; _ref: string })
          : createReference(
              (
                await clientWrite.assets.upload(
                  'image',
                  patch.file as Uploadable,
                  {
                    filename: (patch.file as File).name || 'image',
                    contentType: (patch.file as File).type || 'image/jpeg',
                  },
                )
              )._id,
            )

      updatePatch.image = {
        _type: 'image',
        asset: assetRef,
        ...(patch.imageAlt !== undefined ? { alt: patch.imageAlt } : {}),
        ...(patch.hotspot !== undefined ? { hotspot: patch.hotspot } : {}),
        ...(patch.crop !== undefined ? { crop: patch.crop } : {}),
      }
    } else {
      // Update alt text, hotspot, or crop without changing the asset
      if (patch.imageAlt !== undefined) {
        updatePatch['image.alt'] = patch.imageAlt
      }
      if (patch.hotspot !== undefined) {
        updatePatch['image.hotspot'] = patch.hotspot
      }
      if (patch.crop !== undefined) {
        updatePatch['image.crop'] = patch.crop
      }
    }

    const updated = await clientWrite.patch(id).set(updatePatch).commit()

    const image = await getGalleryImage(updated._id, conferenceId)

    if (image && patch.speakers !== undefined && patch.notifySpeakers) {
      const newSpeakerIds = patch.speakers.filter(
        (id) => !originalSpeakerIds.includes(id),
      )

      if (newSpeakerIds.length > 0) {
        await publishSpeakerTaggedEvent(image, newSpeakerIds)
      }
    }

    return { image: image || undefined }
  } catch (error) {
    logger.error('Error updating gallery image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imageId: id,
    })
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update gallery image',
      status: 500,
    }
  }
}

/**
 * The TENANT an image belongs to — its conference and that conference's org — or
 * `null` when the image does not exist. A by-id read whose ONLY purpose is to be
 * compared against the request's tenant before a mutation is allowed; every
 * gallery mutation takes an image id from client input, so without this check an
 * organizer of tenant A could edit or delete tenant B's photos.
 */
export async function getGalleryImageTenant(
  id: string,
): Promise<{ conferenceId: string | null; orgId: string | null } | null> {
  try {
    // groq-global: resolves the tenant OF a client-supplied image id so the
    // caller can compare it with the request's tenant (an ownership check, not
    // a listing).
    const query = groq`*[_type == "imageGallery" && _id == $id][0]{
      "conferenceId": conference._ref,
      "orgId": conference->organization._ref
    }`
    return await clientReadUncached.fetch(query, { id }, { cache: 'no-store' })
  } catch (error) {
    logger.error('Error resolving gallery image tenant', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imageId: id,
    })
    // FAIL CLOSED: an unknown tenant must not authorize a mutation.
    return null
  }
}

/**
 * Get a single gallery image by ID, WITHIN one conference (#616): a foreign id
 * resolves to `null` exactly like a nonexistent one. Uses uncached client for
 * immediate consistency after mutations.
 */
export async function getGalleryImage(
  id: string,
  conferenceId: string,
): Promise<GalleryImageWithSpeakers | null> {
  try {
    const query = groq`
      *[_type == "imageGallery" && conference._ref == $conferenceId && _id == $id][0] {
        _id,
        _rev,
        _createdAt,
        _updatedAt,
        image{asset, alt, crop, hotspot},
        "imageUrl": image.asset->url,
        "imageAlt": image.alt,
        photographer,
        date,
        location,
        featured,
        conference->{
          _id,
          title,
          domains
        },
        speakers[]-> {
          _id,
          name,
          "slug": slug.current,
          "image": coalesce(image.asset->url, imageURL)
        }
      }
    `

    return await clientReadUncached.fetch(query, { id, conferenceId })
  } catch (error) {
    logger.error('Error fetching gallery image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imageId: id,
    })
    return null
  }
}

/**
 * The TENANT SCOPE every gallery read must carry (#616): exactly one conference,
 * or exactly one organization (all of that org's conferences — what a speaker's
 * cross-edition "my photos" list needs). There is deliberately no "unscoped"
 * member: a gallery read that cannot name its tenant must not run.
 */
export type GalleryScope =
  | { conferenceId: string; orgId?: undefined }
  | { orgId: string; conferenceId?: undefined }

/**
 * Turn a {@link GalleryScope} into a GROQ predicate + params, or `null` when the
 * scope is blank/absent (fail CLOSED — callers must return empty, never query).
 */
function galleryScopeClause(
  scope: Partial<GalleryScope> | undefined,
): { clause: string; params: Record<string, string> } | null {
  if (scope?.conferenceId) {
    return {
      clause: 'conference._ref == $conferenceId',
      params: { conferenceId: scope.conferenceId },
    }
  }
  if (scope?.orgId) {
    return {
      clause: 'conference->organization._ref == $orgId',
      params: { orgId: scope.orgId },
    }
  }
  return null
}

/**
 * Count gallery images within ONE tenant scope.
 *
 * TENANT SCOPING (#616): a {@link GalleryScope} is REQUIRED and its predicate is
 * unconditional — see {@link getGalleryImages} for why. A blank scope fails
 * CLOSED (returns 0) rather than counting the whole dataset.
 */
export async function getGalleryImageCount(
  filter: GalleryImageFilter & GalleryScope,
  useCache = true,
): Promise<number> {
  const scope = galleryScopeClause(filter)
  if (!scope) {
    logger.error(
      'getGalleryImageCount called without a tenant scope; returning 0 (#616)',
    )
    return 0
  }
  try {
    // groq-global-scoped: `scope.clause` is galleryScopeClause() — always exactly
    // `conference._ref == $conferenceId` or `conference->organization._ref ==
    // $orgId`, and a blank scope failed CLOSED (returned 0) above the query.
    const query = groq`
      count(*[_type == "imageGallery"
        && ${scope.clause}
        && (!defined($featured) || featured == $featured)
        && (!defined($speakerId) || $speakerId in speakers[]._ref)
        && (!defined($dateFrom) || date >= $dateFrom)
        && (!defined($dateTo) || date <= $dateTo)
        && (!defined($photographerSearch) || photographer match $photographerSearch)
        && (!defined($locationSearch) || location match $locationSearch)
      ])
    `

    const queryParams: Record<string, unknown> = {
      ...scope.params,
      featured: filter?.featured ?? null,
      speakerId: filter?.speakerId ?? null,
      dateFrom: filter?.dateFrom ?? null,
      dateTo: filter?.dateTo ?? null,
      photographerSearch: filter?.photographerSearch
        ? `*${filter.photographerSearch}*`
        : null,
      locationSearch: filter?.locationSearch
        ? `*${filter.locationSearch}*`
        : null,
    }

    const client = useCache ? clientReadCached : clientReadUncached
    return (await client.fetch(query, queryParams)) || 0
  } catch (error) {
    logger.error('Error fetching gallery image count', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return 0
  }
}

/**
 * Get gallery images within ONE tenant scope (a conference, or an org's
 * conferences).
 *
 * TENANT SCOPING (#616). A {@link GalleryScope} is REQUIRED and its predicate is
 * UNCONDITIONAL. Both properties are load-bearing; the previous filter read
 * `(!defined($conferenceId) || conference._ref == $conferenceId ||
 * !defined(conference))`, which
 *   1. returned the WHOLE dataset's images when no id was passed (the speaker
 *      "my photos" queries and the unknown-host branch of
 *      `getConferenceForDomain` both did exactly that), and
 *   2. leaked every conference-LESS image into every tenant's gallery via the
 *      `!defined(conference)` arm.
 * An image that references no conference now belongs to no tenant and is
 * returned to nobody; `createGalleryImage` has always required a conference, so
 * only documents hand-made in Studio can be in that state (they must be given a
 * conference to reappear).
 *
 * A blank scope fails CLOSED (returns []) rather than reading globally.
 */
export async function getGalleryImages(
  filter: GalleryImageFilter & GalleryScope,
  options?: { useCache?: boolean },
): Promise<GalleryImageWithSpeakers[]> {
  const scope = galleryScopeClause(filter)
  if (!scope) {
    logger.error(
      'getGalleryImages called without a tenant scope; returning [] (#616)',
    )
    return []
  }
  try {
    const limit = filter?.limit || 100
    const offset = filter?.offset || 0
    const useCache = options?.useCache ?? true

    // groq-global-scoped: `scope.clause` is galleryScopeClause() — always exactly
    // `conference._ref == $conferenceId` or `conference->organization._ref ==
    // $orgId`, and a blank scope failed CLOSED (returned []) above the query.
    const query = groq`
      *[_type == "imageGallery"
        && ${scope.clause}
        && (!defined($featured) || featured == $featured)
        && (!defined($speakerId) || $speakerId in speakers[]._ref)
        && (!defined($dateFrom) || date >= $dateFrom)
        && (!defined($dateTo) || date <= $dateTo)
        && (!defined($photographerSearch) || photographer match $photographerSearch)
        && (!defined($locationSearch) || location match $locationSearch)
      ] | order(date asc) [$offset...$end] {
        _id,
        _rev,
        _createdAt,
        _updatedAt,
        image{asset, alt, crop, hotspot},
        "imageUrl": image.asset->url,
        "imageAlt": image.alt,
        photographer,
        date,
        location,
        featured,
        conference->{
          _id,
          title,
          domains
        },
        speakers[]-> {
          _id,
          name,
          "slug": slug.current,
          "image": coalesce(image.asset->url, imageURL)
        }
      }
    `

    const queryParams: Record<string, unknown> = {
      offset,
      end: offset + limit,
      ...scope.params,
      featured: filter?.featured ?? null,
      speakerId: filter?.speakerId ?? null,
      dateFrom: filter?.dateFrom ?? null,
      dateTo: filter?.dateTo ?? null,
      photographerSearch: filter?.photographerSearch
        ? `*${filter.photographerSearch}*`
        : null,
      locationSearch: filter?.locationSearch
        ? `*${filter.locationSearch}*`
        : null,
    }

    const client = useCache ? clientReadCached : clientReadUncached
    return (await client.fetch(query, queryParams)) || []
  } catch (error) {
    logger.error('Error fetching gallery images', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return []
  }
}

/**
 * Get featured gallery images for ONE conference. `conferenceId` is REQUIRED
 * (tenant scoping, #616) — see {@link getGalleryImages}.
 *
 * An omitted `limit` means "the house default", NOT "everything". The previous
 * fallback of 1000 was effectively unbounded: the homepage never passes a limit
 * (`getConferenceForDomain({ gallery: { featuredOnly: true } })`), so a tenant
 * that features 60 photos would ship all 60 into the flight payload and render
 * 60 carousel dots. `GALLERY_CONSTANTS.LIMITS.FEATURED_IMAGES` is what the band
 * is designed around — `ImageGallery` already slices its own fallback to the
 * same 8 — so it is the default here too. Callers that genuinely want more
 * (admin marketing) pass an explicit limit.
 *
 * `options.useCache` defaults to TRUE (the public pages' behaviour, unchanged).
 * The homepage composer preview passes `false` so an organizer who just
 * featured a photo sees it immediately rather than up to an hour later.
 */
export async function getFeaturedGalleryImages(
  limit: number | undefined,
  conferenceId: string,
  options?: { useCache?: boolean },
): Promise<GalleryImageWithSpeakers[]> {
  return getGalleryImages(
    {
      featured: true,
      limit: limit ?? GALLERY_CONSTANTS.LIMITS.FEATURED_IMAGES,
      conferenceId,
    },
    { useCache: options?.useCache ?? true },
  )
}

/**
 * Delete a gallery image and clean up orphaned assets.
 *
 * TENANT SCOPING (#616): `conferenceId` is the REQUEST's conference, already
 * proven to own `id` by the router's `requireImageInConference` guard. The by-id
 * read below carries the predicate too and the delete is REFUSED when it finds
 * nothing — a foreign id fails exactly like a nonexistent one.
 */
export async function deleteGalleryImage(
  id: string,
  conferenceId: string,
): Promise<boolean> {
  try {
    const data = await clientReadUncached.fetch<{
      assetId?: string | null
    } | null>(
      groq`*[_type=="imageGallery" && conference._ref == $conferenceId && _id==$id][0]{ "assetId": image.asset->_id }`,
      { id, conferenceId },
    )

    if (!data) {
      // Foreign or nonexistent — either way, nothing this tenant may delete.
      return false
    }

    const transaction = clientWrite.transaction()
    transaction.delete(id)
    await transaction.commit()

    if (data?.assetId) {
      const stillUsed = await clientReadUncached.fetch(
        // groq-global: dataset-wide refcount of the underlying image ASSET
        // before destroying it — it must see EVERY tenant's references to fail
        // safe (deleting an asset another document still uses breaks that doc).
        groq`count(*[references($assetId)])`,
        { assetId: data.assetId },
      )

      if (!stillUsed) {
        await clientWrite.delete(data.assetId)
      }
    }

    return true
  } catch (error) {
    logger.error('Error deleting gallery image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imageId: id,
    })
    return false
  }
}

/**
 * Untag a speaker from a gallery image
 * This removes the speaker from the speakers array and adds them to untaggedSpeakers
 * to prevent future re-tagging
 *
 * TENANT SCOPING (#616): `orgId` is the REQUEST's org, already proven to own
 * `imageId` by the router's `requireImageInOrg` guard (org, not conference, so a
 * speaker can untag themselves across editions). The by-id read carries the
 * predicate too — a foreign id reads as 'Image not found', same as nonexistent.
 */
export async function untagSpeakerFromImage(
  imageId: string,
  speakerId: string,
  orgId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const image = await clientReadUncached.fetch<{
      speakers?: Array<{ _ref: string; _key: string }>
      untaggedSpeakers?: Array<{ _ref: string; _key: string }>
    }>(
      groq`*[_type == "imageGallery" && conference->organization._ref == $orgId && _id == $imageId][0]{ speakers, untaggedSpeakers }`,
      { imageId, orgId },
    )

    if (!image) {
      return { success: false, error: 'Image not found' }
    }

    const currentSpeakers = image.speakers || []
    const currentUntagged = image.untaggedSpeakers || []

    const speakerToRemove = currentSpeakers.find((s) => s._ref === speakerId)
    if (!speakerToRemove) {
      return { success: false, error: 'Speaker is not tagged in this image' }
    }

    const isAlreadyUntagged = currentUntagged.some((s) => s._ref === speakerId)

    const patch = clientWrite
      .patch(imageId)
      .unset([`speakers[_key=="${speakerToRemove._key}"]`])

    if (!isAlreadyUntagged) {
      patch.setIfMissing({ untaggedSpeakers: [] })
      patch.append('untaggedSpeakers', [
        {
          ...createReference(speakerId),
          _key: `untagged-${speakerId}`,
        },
      ])
    }

    await patch.commit()

    return { success: true }
  } catch (error) {
    logger.error('Error untagging speaker from image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imageId,
      speakerId,
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to untag speaker from image',
    }
  }
}
