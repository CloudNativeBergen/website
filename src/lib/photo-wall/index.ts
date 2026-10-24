export * from './types'
export { isPostingOpen, postingState, type PostingState } from './window'
export { photoWallLinks } from './links'
export { DELETION_DAYS, deletionDate, deletionDateEnd } from './deletion'
export {
  MAX_LONG_EDGE,
  MAX_PHOTO_BYTES,
  MIN_SHORT_EDGE,
  checkWallPhoto,
  type WallPhotoCheck,
  type WallPhotoRefusal,
} from './jpeg-check'
export {
  MAX_CAPTION_POINTS,
  MAX_NAME_POINTS,
  checkWallFields,
  isUploadId,
  normaliseWallText,
  type WallField,
  type WallFieldsCheck,
  type WallPostFields,
} from './fields'
