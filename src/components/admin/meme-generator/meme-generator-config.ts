export const CANVAS_SIZE = 1080
export const DEFAULT_BG_COLOR = '#10B981'

export const LOGO_SIZE_MIN = 300
export const LOGO_SIZE_MAX = 500
export const LOGO_SIZE_DEFAULT = 360
export const LOGO_PADDING_DEFAULT = 40

export const TEXT_PADDING_MIN = 0
export const TEXT_PADDING_MAX = 30
export const TEXT_PADDING_DEFAULT = 5

export const QR_SIZE_MIN = 100
export const QR_SIZE_MAX = 400
export const QR_SIZE_DEFAULT = 250
export const QR_VERTICAL_POSITION_DEFAULT = 67
export const QR_HORIZONTAL_POSITION_DEFAULT = 50
export const QR_DOTS_COLOR_DEFAULT = '#FFFFFF'
export const QR_BACKGROUND_COLOR_DEFAULT = 'transparent'

export const QR_DOT_TYPES = [
  { name: 'Square', value: 'square' },
  { name: 'Rounded', value: 'rounded' },
  { name: 'Dots', value: 'dots' },
  { name: 'Classy', value: 'classy' },
  { name: 'Extra Rounded', value: 'extra-rounded' },
] as const

export const QR_CORNER_SQUARE_TYPES = [
  { name: 'Square', value: 'square' },
  { name: 'Rounded', value: 'rounded' },
  { name: 'Extra Rounded', value: 'extra-rounded' },
  { name: 'Dot', value: 'dot' },
] as const

export const QR_CORNER_DOT_TYPES = [
  { name: 'Square', value: 'square' },
  { name: 'Rounded', value: 'rounded' },
  { name: 'Dot', value: 'dot' },
] as const

export const BRAND_COLORS = [
  { name: 'Cloud Blue', value: '#1D4ED8' },
  { name: 'Nordic Purple', value: '#6366F1' },
  { name: 'Fresh Green', value: '#10B981' },
  { name: 'Aqua', value: '#06B6D4' },
  { name: 'Slate Gray', value: '#334155' },
  { name: 'Deep Indigo', value: '#4F46E5' },
  { name: 'Sunbeam Yellow', value: '#FACC15' },
  { name: 'Sky Mist', value: '#E0F2FE' },
]

export const TEXT_COLOR_PRESETS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#000000' },
  { name: 'Cloud Blue', value: '#1D4ED8' },
  { name: 'Fresh Green', value: '#10B981' },
  { name: 'Sunbeam Yellow', value: '#FACC15' },
  { name: 'Nordic Purple', value: '#6366F1' },
]

export const FONT_FAMILIES = [
  { value: 'Inter', label: 'Inter' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
  { value: 'Bricolage Grotesque', label: 'Bricolage Grotesque' },
  { value: 'IBM Plex Sans', label: 'IBM Plex Sans' },
  { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
  { value: 'Atkinson Hyperlegible', label: 'Atkinson Hyperlegible' },
]

export interface TextLine {
  text: string
  verticalPosition: number
  fontSize: number
  fontFamily: string
  isBold: boolean
  isUppercase: boolean
  color: string
  textAlign: 'left' | 'center' | 'right'
  horizontalPosition: number
  textPadding: number
}

export const DEFAULT_TEXT_LINES: TextLine[] = [
  {
    text: '',
    verticalPosition: 30,
    fontSize: 120,
    fontFamily: 'Space Grotesk',
    isBold: false,
    isUppercase: true,
    color: '#FFFFFF',
    textAlign: 'center',
    horizontalPosition: 6,
    textPadding: TEXT_PADDING_DEFAULT,
  },
  {
    text: '',
    verticalPosition: 45,
    fontSize: 80,
    fontFamily: 'Space Grotesk',
    isBold: false,
    isUppercase: true,
    color: '#FFFFFF',
    textAlign: 'center',
    horizontalPosition: 6,
    textPadding: TEXT_PADDING_DEFAULT,
  },
  {
    text: '',
    verticalPosition: 70,
    fontSize: 50,
    fontFamily: 'Space Grotesk',
    isBold: false,
    isUppercase: true,
    color: '#FFFFFF',
    textAlign: 'center',
    horizontalPosition: 6,
    textPadding: TEXT_PADDING_DEFAULT,
  },
]

export const styles = {
  input:
    'w-full px-3 py-2 border border-brand-frosted-steel dark:border-gray-600 rounded-md bg-brand-glacier-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-cloud-blue dark:focus:ring-blue-500',
  label:
    'block text-sm font-medium text-brand-slate-gray dark:text-gray-300 mb-2',
  panel:
    'bg-white dark:bg-gray-800 p-4 rounded-lg border border-brand-frosted-steel dark:border-gray-700',
  buttonActive:
    'border-brand-cloud-blue bg-brand-cloud-blue/10 text-brand-cloud-blue dark:border-blue-500 dark:bg-blue-500/20 dark:text-blue-400',
  buttonInactive:
    'border-brand-frosted-steel dark:border-gray-600 text-brand-slate-gray dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
}
