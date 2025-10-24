export default function StreamLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No layout wrapper - stream pages render directly without navigation
  return <>{children}</>
}
