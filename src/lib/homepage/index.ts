// Server-safe barrel: ONLY the registry/model module. The editor logic
// (./editor) deliberately stays a deep import — it pulls in @dnd-kit, a
// client-only dependency, and this barrel is imported by server components
// (page.tsx), so re-exporting it here would drag-and-drop code into the
// RSC module graph and break the build.
export * from './sections'
export * from './richText'
