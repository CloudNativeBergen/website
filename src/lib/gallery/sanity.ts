import { groq } from 'next-sanity'
import {
  clientWrite,
  clientReadCached,
  clientReadUncached,
} from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import { logger } from '@/lib/logger'
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
        logger.info('Successfully uploaded asset', {
          assetId: uploadedAsset._id,
          filename: (file as File).name,
        })
      } catch (uploadError) {
        logger.error('Failed to upload asset to Sanity', {
          error: uploadError instanceof Error ? uploadError.message : 'Unknown error',
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
    logger.info('Successfully created gallery document', {
      documentId: created._id,
    })

    const image = await getGalleryImage(created._id)

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
 * Update an existing gallery image
 */
export async function updateGalleryImage(
  id: string,
  patch: UpdateGalleryImageInput,
): Promise<GalleryImageResponse> {
  try {
    let originalSpeakerIds: string[] = []
    if (patch.speakers !== undefined) {
      const original = await clientReadUncached.fetch<{
        speakers?: Array<{ _ref: string }>
      }>(groq`*[_type == "imageGallery" && _id == $id][0]{ speakers }`, { id })
      originalSpeakerIds = (original?.speakers || []).map((s) => s._ref)
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
      updatePatch.speakers = Array.from(new Set(patch.speakers))
        .filter(Boolean)
        .map((speakerId) => ({
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
      }
    } else if (patch.imageAlt !== undefined) {
      updatePatch['image.alt'] = patch.imageAlt
    }

    const updated = await clientWrite.patch(id).set(updatePatch).commit()

    const image = await getGalleryImage(updated._id)

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
 * Get a single gallery image by ID
 * Uses uncached client for immediate consistency after mutations
 */
export async function getGalleryImage(
  id: string,
): Promise<GalleryImageWithSpeakers | null> {
  try {
    const query = groq`
      *[_type == "imageGallery" && _id == $id][0] {
        _id,
        _rev,
        _createdAt,
        _updatedAt,
        image{asset, alt},
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
          "image": image.asset->url
        }
      }
    `

    return await clientReadUncached.fetch(query, { id })
  } catch (error) {
    logger.error('Error fetching gallery image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imageId: id,
    })
    return null
  }
}

/**
 * Get count of gallery images with optional filtering
 * Uses cached client with CDN for performance, similar to conference module
 */
export async function getGalleryImageCount(
  filter?: GalleryImageFilter & { conferenceId?: string },
  useCache = true,
): Promise<number> {
  try {
    const query = groq`
      count(*[_type == "imageGallery"
        && (!defined($conferenceId) || conference._ref == $conferenceId)
        && (!defined($featured) || featured == $featured)
        && (!defined($speakerId) || $speakerId in speakers[]._ref)
        && (!defined($dateFrom) || date >= $dateFrom)
        && (!defined($dateTo) || date <= $dateTo)
        && (!defined($photographerSearch) || photographer match $photographerSearch)
        && (!defined($locationSearch) || location match $locationSearch)
      ])
    `

    const queryParams: Record<string, unknown> = {
      conferenceId: filter?.conferenceId ?? null,
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
 * Get gallery images with optional filtering
 * Uses cached client with CDN for performance, similar to conference module
 */
export async function getGalleryImages(
  filter?: GalleryImageFilter & { conferenceId?: string },
  options?: { revalidate?: number; useCache?: boolean },
): Promise<GalleryImageWithSpeakers[]> {
  try {
    const limit = filter?.limit || 100
    const offset = filter?.offset || 0
    const useCache = options?.useCache ?? true
    const revalidate = options?.revalidate

    // For backward compatibility: if images don't have conference field, they'll still be fetched
    // Once conference field is added to images, filtering will work properly
    const query = groq`
      *[_type == "imageGallery"
        && (!defined($conferenceId) || conference._ref == $conferenceId || !defined(conference))
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
        image{asset, alt},
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
          "image": image.asset->url
        }
      }
    `

    const queryParams: Record<string, unknown> = {
      offset,
      end: offset + limit,
      conferenceId: filter?.conferenceId ?? null,
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

    if (useCache) {
      return (
        (await clientReadCached.fetch(
          query,
          queryParams,
          revalidate ? { next: { revalidate } } : undefined,
        )) || []
      )
    } else {
      return (await clientReadUncached.fetch(query, queryParams)) || []
    }
  } catch (error) {
    logger.error('Error fetching gallery images', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return []
  }
}

/**
 * Get featured gallery images
 */
export async function getFeaturedGalleryImages(
  limit?: number,
  revalidate?: number,
  conferenceId?: string,
): Promise<GalleryImageWithSpeakers[]> {
  return getGalleryImages(
    { featured: true, limit, conferenceId },
    { revalidate },
  )
}

/**
 * Delete a gallery image and clean up orphaned assets
 */
export async function deleteGalleryImage(id: string): Promise<boolean> {
  try {
    const data = await clientReadUncached.fetch(
      groq`*[_type=="imageGallery" && _id==$id][0]{ "assetId": image.asset->_id }`,
      { id },
    )

    const transaction = clientWrite.transaction()
    transaction.delete(id)
    await transaction.commit()

    if (data?.assetId) {
      const stillUsed = await clientReadUncached.fetch(
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
