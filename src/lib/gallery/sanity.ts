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
  ProgressCallback,
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
    // Handle overload signatures
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

    // Validate required fields
    if (!photographer || !date || !location || !conference) {
      return {
        error:
          'Missing required fields: photographer, date, location, or conference',
        status: 400,
      }
    }

    // Handle both file upload and reference
    const assetRef =
      (file as { _type?: string })?._type === 'reference'
        ? (file as { _type: 'reference'; _ref: string })
        : createReference(
            (
              await clientWrite.assets.upload('image', file as Uploadable, {
                filename: (file as File).name || 'image',
                contentType: (file as File).type || 'image/jpeg',
              })
            )._id,
          )

    // Create gallery image document
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

    // Fetch the created image with resolved URL
    const image = await getGalleryImage(created._id)

    // Publish event for speaker tagging if there are speakers
    if (image && speakers.length > 0) {
      await publishSpeakerTaggedEvent(image, speakers)
    }

    return { image: image || undefined }
  } catch (error) {
    logger.error('Error creating gallery image', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
    // Fetch original speaker IDs before update if speakers are being updated
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

    // Handle file upload for replacing the image asset
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
      // Update nested image.alt field
      updatePatch['image.alt'] = patch.imageAlt
    }

    const updated = await clientWrite.patch(id).set(updatePatch).commit()

    // Fetch the updated image with resolved data
    const image = await getGalleryImage(updated._id)

    // Publish event for newly tagged speakers only if notifications are enabled
    if (image && patch.speakers !== undefined && patch.notifySpeakers) {
      // Find newly added speaker IDs
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

    // Always provide all params to avoid GROQ parse errors
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

    return (await clientReadCached.fetch(query, queryParams)) || 0
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
  revalidate?: number,
): Promise<GalleryImageWithSpeakers[]> {
  try {
    const limit = filter?.limit || 100
    const offset = filter?.offset || 0

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
      ] | order(date desc) [$offset...$end] {
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

    // Always provide all params to avoid GROQ parse errors
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

    return (
      (await clientReadCached.fetch(
        query,
        queryParams,
        revalidate ? { next: { revalidate } } : undefined,
      )) || []
    )
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
  return getGalleryImages({ featured: true, limit, conferenceId }, revalidate)
}

/**
 * Get gallery images by speaker
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getGalleryImagesBySpeaker(
  speakerId: string,
): Promise<GalleryImageWithSpeakers[]> {
  return getGalleryImages({ speakerId })
}

/**
 * Create multiple gallery images with progress tracking
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function createGalleryImages(
  inputs: CreateGalleryImageInput[],
  onProgress?: ProgressCallback,
): Promise<{
  successful: GalleryImageWithSpeakers[]
  failed: Array<{ input: CreateGalleryImageInput; error: string }>
}> {
  const successful: GalleryImageWithSpeakers[] = []
  const failed: Array<{ input: CreateGalleryImageInput; error: string }> = []

  for (let i = 0; i < inputs.length; i++) {
    try {
      const result = await createGalleryImage(inputs[i])
      if (result.image) {
        successful.push(result.image)
      } else {
        failed.push({
          input: inputs[i],
          error: result.error || 'Unknown error',
        })
      }
    } catch (error) {
      failed.push({
        input: inputs[i],
        error:
          error instanceof Error ? error.message : 'Failed to create image',
      })
    }

    if (onProgress) {
      onProgress(i + 1, inputs.length)
    }
  }

  return { successful, failed }
}

/**
 * Update gallery image metadata (without file upload)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function updateGalleryImageMetadata(
  id: string,
  metadata: Omit<UpdateGalleryImageInput, 'file'>,
): Promise<GalleryImageResponse> {
  return updateGalleryImage(id, metadata)
}

/**
 * Delete a gallery image and clean up orphaned assets
 */
export async function deleteGalleryImage(id: string): Promise<boolean> {
  try {
    // First get the asset ID before deletion
    const data = await clientReadUncached.fetch(
      groq`*[_type=="imageGallery" && _id==$id][0]{ "assetId": image.asset->_id }`,
      { id },
    )

    // Use transaction to delete document and conditionally delete asset
    const transaction = clientWrite.transaction()

    // Delete the gallery document
    transaction.delete(id)

    // Commit the deletion first
    await transaction.commit()

    // After deletion is committed, check if asset is still referenced
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
