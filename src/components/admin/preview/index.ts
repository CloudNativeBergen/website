/**
 * The homepage composer's live preview (E4).
 *
 * `HomepagePreview` is the whole page render and the only thing the preview
 * ROUTE mounts; the rest is exported for stories, tests and the composer batch
 * that will build the surrounding workspace.
 */
export { HomepagePreview, type HomepagePreviewProps } from './HomepagePreview'
export { PreviewChrome, type PreviewChromeProps } from './PreviewChrome'
export {
  PreviewBandFrame,
  type PreviewBandFrameProps,
} from './PreviewBandFrame'
export {
  sweepPreviewDom,
  usePreviewDomGuard,
  type PreviewDomGuardOptions,
} from './usePreviewDomGuard'
