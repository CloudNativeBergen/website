import { Metadata } from 'next'
import { DuplicatesClient } from './DuplicatesClient'

export const metadata: Metadata = {
  title: 'Duplicate Speakers | Admin',
}

export default async function DuplicateSpeakersPage() {
  return <DuplicatesClient />
}
