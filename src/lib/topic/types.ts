export interface Topic {
  _id: string
  _type: 'topic'
  title: string
  description?: string
  color: string
  slug: {
    current: string
  }
}
