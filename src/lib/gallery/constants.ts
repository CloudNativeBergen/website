export const GALLERY_CONSTANTS = {
  UPLOAD: {
    MAX_FILE_SIZE_MB: 10,
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
    CONCURRENT_UPLOADS: 3,
    ACCEPTED_MIME_TYPES: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/gif': ['.gif'],
    },
    RESIZE_MAX_WIDTH: 2560,
    RESIZE_MAX_HEIGHT: 2560,
    RESIZE_QUALITY: 0.92,
  },
  LIMITS: {
    FEATURED_IMAGES: 8,
    DEFAULT_GALLERY_LIMIT: 50,
    PAGINATION_DEFAULT: 50,
  },
  DEBOUNCE: {
    SEARCH_TEXT_MS: 500,
    SPEAKER_SEARCH_MS: 300,
  },
  THROTTLE: {
    NAVIGATION_MS: 200,
  },
  NOTIFICATION: {
    EMAIL_CONCURRENCY: 5,
  },
  CAROUSEL: {
    AUTO_PLAY_INTERVAL_MS: 5000,
    SWIPE_THRESHOLD_PX: 50,
  },
} as const
