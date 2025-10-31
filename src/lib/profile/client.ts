import { ProfileEmailResponse, ProfileImageResponse } from './types'

export async function putEmail(email: string): Promise<ProfileEmailResponse> {
  const url = `/api/profile/emails`

  const res = await fetch(url, {
    next: { revalidate: 0 },
    cache: 'no-store',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  return (await res.json()) as ProfileEmailResponse
}

export async function postImage(file: File): Promise<ProfileImageResponse> {
  const url = `/api/profile/image`

  const formData = new FormData()
  formData.append('files', file)

  try {
    const res = await fetch(url, {
      next: { revalidate: 0 },
      cache: 'no-store',
      method: 'POST',
      body: formData,
    })
    return (await res.json()) as ProfileImageResponse
  } catch (error) {
    console.error('Image upload failed', error)

    return {
      status: 500,
      error: {
        message: 'Failed to upload image',
        type: 'upload',
      },
    } as ProfileImageResponse
  }
}
