import { FormError } from '@/lib/proposal/types'

export interface ProfileEmail {
  email: string
  primary: boolean
  verified: boolean
  visibility: string
}

export interface ProfileImage {
  image: string
}

export interface ProfileImageResponse {
  image?: ProfileImage
  error?: FormError
  status: number
}
