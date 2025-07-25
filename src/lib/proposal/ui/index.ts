/**
 * Centralized UI exports for proposal components
 * This provides a clean API for importing proposal UI components
 */

// Badge components and configurations
export {
  StatusBadge,
  LevelBadge,
  LanguageBadge,
  FormatBadge,
  AudienceBadge,
  AudienceBadges,
  LevelIndicator,
  getStatusBadgeConfig,
  getAudienceBadgeConfig,
  getLevelBadgeConfig,
  getLanguageBadgeConfig,
  getFormatBadgeConfig,
  getLevelConfig,
  LEVEL_CONFIG,
  type BadgeConfig,
  type LevelConfig,
  type LevelIndicatorProps,
} from './badges'

// Speaker indicators
export {
  SpeakerIndicators,
  getSpeakerIndicators,
  type SpeakerIndicator,
} from './speaker-indicators'

// Display components
export { RatingDisplay, MetadataRow } from './display'
