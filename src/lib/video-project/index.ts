// Client-safe surface. Server-only modules (`./sanity`) and the stored
// document builder (`./document`) are imported by path.
export {
  PROJECT_CONFLICT_MESSAGE,
  VIDEO_PROJECT_FORMAT_VERSION,
  VIDEO_PROJECT_MAX_TITLE,
  copyTitle,
  projectFormatRefusal,
  unkeptBackgroundRefusal,
} from './format'
export { trackSourceSchema, trackUrl } from './track-source'
export type { TrackSource } from './track-source'
export type {
  OpenedImage,
  OpenedProject,
  OpenedScene,
  OpenedTrack,
  ProjectSceneInput,
  ProjectTrackInput,
  VideoProjectRow,
} from './format'
