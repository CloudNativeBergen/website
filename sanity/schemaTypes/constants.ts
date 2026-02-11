/**
 * Shared constants for Sanity schema field options.
 *
 * Centralizes option lists that are used across multiple schemas
 * to ensure consistency and eliminate duplication.
 */

export const CURRENCY_OPTIONS = [
  { title: 'Norwegian Krone (NOK)', value: 'NOK' },
  { title: 'US Dollar (USD)', value: 'USD' },
  { title: 'Euro (EUR)', value: 'EUR' },
  { title: 'British Pound (GBP)', value: 'GBP' },
  { title: 'Swedish Krona (SEK)', value: 'SEK' },
  { title: 'Danish Krone (DKK)', value: 'DKK' },
  { title: 'Other', value: 'OTHER' },
] as const

export const CURRENCY_VALUES = CURRENCY_OPTIONS.map((c) => c.value)

/**
 * Heroicon options for use in schema icon picker fields.
 * Union of all icons used across ticketInclusions and sponsorBenefits.
 */
export const HEROICON_OPTIONS = [
  { title: 'Academic Cap', value: 'AcademicCapIcon' },
  { title: 'Beaker', value: 'BeakerIcon' },
  { title: 'Briefcase', value: 'BriefcaseIcon' },
  { title: 'Building Office', value: 'BuildingOfficeIcon' },
  { title: 'Camera', value: 'CameraIcon' },
  { title: 'Chart Bar', value: 'ChartBarIcon' },
  { title: 'Chat Bubble', value: 'ChatBubbleLeftRightIcon' },
  { title: 'Check Badge', value: 'CheckBadgeIcon' },
  { title: 'Code Bracket', value: 'CodeBracketIcon' },
  { title: 'Command Line', value: 'CommandLineIcon' },
  { title: 'CPU Chip', value: 'CpuChipIcon' },
  { title: 'Film', value: 'FilmIcon' },
  { title: 'Gift', value: 'GiftIcon' },
  { title: 'Globe', value: 'GlobeAltIcon' },
  { title: 'Hand Raised', value: 'HandRaisedIcon' },
  { title: 'Handshake (Thumb Up)', value: 'HandThumbUpIcon' },
  { title: 'Heart', value: 'HeartIcon' },
  { title: 'Light Bulb', value: 'LightBulbIcon' },
  { title: 'Megaphone', value: 'MegaphoneIcon' },
  { title: 'Microphone', value: 'MicrophoneIcon' },
  { title: 'Musical Note', value: 'MusicalNoteIcon' },
  { title: 'Newspaper', value: 'NewspaperIcon' },
  { title: 'Presentation Chart', value: 'PresentationChartBarIcon' },
  { title: 'Rocket Launch', value: 'RocketLaunchIcon' },
  { title: 'Signal', value: 'SignalIcon' },
  { title: 'Sparkles', value: 'SparklesIcon' },
  { title: 'Star', value: 'StarIcon' },
  { title: 'Trophy', value: 'TrophyIcon' },
  { title: 'User Group', value: 'UserGroupIcon' },
] as const
