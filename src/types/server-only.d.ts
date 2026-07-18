/**
 * Ambient declaration for the `server-only` marker module (issue #444).
 *
 * `import 'server-only'` is a side-effect-only guard: Next.js aliases it to a
 * module that throws if the importing file is ever pulled into a client bundle
 * (it resolves to `next/dist/compiled/server-only` at build time, so no
 * top-level dependency is required). This declaration exists solely so
 * `moduleResolution: bundler` type-checking can resolve the bare specifier.
 */
declare module 'server-only'
