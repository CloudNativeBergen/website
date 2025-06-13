import { Reference } from 'sanity'
import { Speaker } from '../speaker/types'

export type ReviewBase = {
  comment: string
  score: {
    content: number
    relevance: number
    speaker: number
  }
}

export interface Review extends ReviewBase {
  _id: string
  _rev: string
  _createdAt: string
  _updatedAt: string
  reviewer: Speaker | Reference
  proposal: Reference
}
