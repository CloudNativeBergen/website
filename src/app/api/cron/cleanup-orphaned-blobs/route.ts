import { NextRequest, NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { cleanupOrphanedBlob } from '@/lib/attachment/blob'
import { unstable_noStore as noStore } from 'next/cache'

/**
 * Blob retention period in hours before cleanup.
 * 24 hours provides a safety window for:
 * - Debugging upload issues
 * - Manual recovery if needed
 * - Handling temporary network failures during transfer
 */
const BLOB_RETENTION_HOURS = 24

export async function GET(request: NextRequest) {
  noStore()
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      )
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('Invalid or missing authorization token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const retentionThreshold = new Date(
      Date.now() - BLOB_RETENTION_HOURS * 60 * 60 * 1000,
    )

    const { blobs } = await list({
      prefix: 'proposal-',
      mode: 'expanded',
    })

    const orphanedBlobs = blobs.filter((blob) => {
      return blob.uploadedAt < retentionThreshold
    })

    console.log(
      `Found ${blobs.length} total blobs with proposal- prefix, ${orphanedBlobs.length} are older than ${BLOB_RETENTION_HOURS}h`,
    )

    if (orphanedBlobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orphaned blobs found',
        cleaned: 0,
      })
    }

    const results = await Promise.allSettled(
      orphanedBlobs.map((blob) => cleanupOrphanedBlob(blob.url)),
    )

    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length
    const failureCount = results.length - successCount

    if (failureCount > 0) {
      console.error(
        `Failed to cleanup ${failureCount} of ${orphanedBlobs.length} orphaned blobs`,
      )
    } else {
      console.log(`Successfully cleaned up ${successCount} orphaned blobs`)
    }

    return NextResponse.json({
      success: true,
      cleaned: successCount,
      failed: failureCount,
      total: orphanedBlobs.length,
    })
  } catch (error) {
    console.error('Error in cleanup orphaned blobs cron job:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
