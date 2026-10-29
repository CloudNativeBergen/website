import { BookmarksProvider } from '@/contexts/BookmarksContext'

// Same localStorage-backed provider as /program, so talks bookmarked here
// show up in the program's agenda view.
export default function SpeakerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <BookmarksProvider>{children}</BookmarksProvider>
}
