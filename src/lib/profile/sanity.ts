import { clientWrite } from '../sanity/client'

export async function updateProfileEmail(
  email: string,
  speakerId: string,
): Promise<{ error: Error | null }> {
  try {
    await clientWrite.patch(speakerId).set({ email }).commit()

    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}
