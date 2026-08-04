// The registry/model module — the homepage vocabulary every layer shares.
//
// The editor logic (./editor) stays a deep import to keep this surface small,
// NOT because it is unsafe to reach from a server component: it no longer has
// any runtime dependency (see the inlined `arrayMove` there), so importing a
// label map or a type guard from it does not drag client-only code into the
// RSC graph. That property is load-bearing — keep ./editor dependency-free.
export * from './sections'
export * from './richText'
// The variant registry is part of the shared vocabulary (the renderer, the write
// path and the Studio schema all read it) and is itself dependency-free.
export * from './variants'
