import { BookmarksProvider } from '@/contexts/BookmarksContext'

export default function ProgramLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <BookmarksProvider>{children}</BookmarksProvider>
}
