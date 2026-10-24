/**
 * The tRPC route has a 60 s budget and Resend allows about 2 sends a second,
 * so one call mails at most this many volunteers. The client sends the rest
 * in sequential chunks.
 */
export const VOLUNTEER_EMAIL_CHUNK = 25

export interface VolunteerSendFailure {
  id: string
  email: string
  error: string
}

/**
 * Send `ids` in sequential chunks. Stops at the first chunk that throws and
 * reports how many ids were handled, so a retry can resume at `ids.slice(done)`
 * without mailing anyone twice.
 */
export async function sendInChunks(
  ids: string[],
  sendChunk: (chunk: string[]) => Promise<{ failed: VolunteerSendFailure[] }>,
  onProgress?: (done: number) => void,
): Promise<{ done: number; failed: VolunteerSendFailure[]; error?: Error }> {
  const failed: VolunteerSendFailure[] = []
  let done = 0
  while (done < ids.length) {
    const chunk = ids.slice(done, done + VOLUNTEER_EMAIL_CHUNK)
    try {
      failed.push(...(await sendChunk(chunk)).failed)
    } catch (e) {
      return {
        done,
        failed,
        error: e instanceof Error ? e : new Error(String(e)),
      }
    }
    done += chunk.length
    onProgress?.(done)
  }
  return { done, failed }
}
