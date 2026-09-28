// Client-safe surface. Server-only modules (`./move`, `./sanity`) are imported
// by path so they never reach a client bundle through this barrel.
export {
  MARKETING_ASSET_BLOB_PREFIX,
  marketingAssetPathname,
  marketingAssetPrefix,
} from './blob-url'
export {
  MARKETING_ASSET_IMAGE_TYPES,
  MARKETING_ASSET_MAX_IMAGE_BYTES,
  MARKETING_ASSET_MAX_IMAGE_LABEL,
  MARKETING_ASSET_SIZE_REFUSAL,
  MARKETING_ASSET_TYPE_REFUSAL,
  SOFT_ON_SOCIAL_SHORT_SIDE,
  isSoftOnSocial,
} from './image-type'
export {
  MARKETING_ASSET_MAX_TAGS,
  MARKETING_ASSET_MAX_TAG_LENGTH,
  normalizeTags,
} from './details'
export {
  MARKETING_ASSET_AUDIO_LENGTH_REFUSAL,
  MARKETING_ASSET_AUDIO_SIZE_REFUSAL,
  MARKETING_ASSET_AUDIO_TYPE_REFUSAL,
  MARKETING_ASSET_AUDIO_TYPES,
  MARKETING_ASSET_MAX_AUDIO_BYTES,
  MARKETING_ASSET_MAX_AUDIO_LABEL,
  MARKETING_ASSET_MAX_AUDIO_SECONDS,
  MARKETING_ASSET_RIGHTS_REFUSAL,
  MARKETING_ASSET_RIGHTS_STATEMENT,
  MARKETING_ASSET_WAV_FORMAT_REFUSAL,
  audioTypeForFile,
  formatTrackLength,
} from './audio-type'
export { MARKETING_ASSET_SUBJECT_TYPES, kindHasAlt } from './types'
export {
  MARKETING_ASSET_GIF_SIZE_REFUSAL,
  MARKETING_ASSET_GIF_TYPE,
  MARKETING_ASSET_GIF_TYPE_REFUSAL,
  MARKETING_ASSET_MAX_GIF_BYTES,
  MARKETING_ASSET_MAX_GIF_LABEL,
  MARKETING_ASSET_MAX_VIDEO_BYTES,
  MARKETING_ASSET_MAX_VIDEO_LABEL,
  MARKETING_ASSET_POSTER_REFUSAL,
  MARKETING_ASSET_VIDEO_SIZE_REFUSAL,
  MARKETING_ASSET_VIDEO_TYPE,
  MARKETING_ASSET_VIDEO_TYPE_REFUSAL,
  isQuickTimeFile,
  motionKindForFile,
} from './motion-type'
export type { MotionKind } from './motion-type'
export { NOT_ATTACHABLE_YET, isAttachableToPost } from './post-attach'
export { STUDIO_TABS, openInStudioHref, opensTheCard } from './studio'
export type { MarketingAssetStudioOrigin, StudioTab } from './studio'
export type {
  MarketingAssetDetails,
  MarketingAssetEditionChoice,
  MarketingAssetFacets,
  MarketingAssetFilter,
  MarketingAssetKind,
  MarketingAssetRights,
  MarketingAssetRow,
  MarketingAssetScope,
  MarketingAssetSubject,
  MarketingAssetSubjectType,
} from './types'
