import { clientReadCached as client } from '../sanity/client'
import { Topic } from './types'

export async function getTopics(): Promise<Topic[]> {
  return client.fetch(`*[_type == "topic"] | order(title asc)`)
}

export async function getTopicById(id: string): Promise<Topic | null> {
  return client.fetch(`*[_type == "topic" && _id == $id][0]`, { id })
}

export async function getTopicBySlug(slug: string): Promise<Topic | null> {
  return client.fetch(`*[_type == "topic" && slug.current == $slug][0]`, { slug })
}
