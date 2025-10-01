const AVATAR_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
] as const

const FALLBACK_COLOR = 'bg-gray-500' as const
const FALLBACK_INITIALS = '?' as const

interface NormalizedNameData {
  isValid: boolean
  nameParts: string[]
  firstChar: string
}

const INVALID_NAME_DATA: NormalizedNameData = {
  isValid: false,
  nameParts: [],
  firstChar: FALLBACK_INITIALS,
} as const

function normalizeNameData(name: string): NormalizedNameData {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return INVALID_NAME_DATA
  }

  const nameParts = name.trim().split(/\s+/).filter(Boolean)
  const firstChar = nameParts[0]?.charAt(0).toUpperCase() || FALLBACK_INITIALS

  return {
    isValid: nameParts.length > 0,
    nameParts,
    firstChar,
  }
}

function getAvatarColor(nameData: NormalizedNameData): string {
  if (!nameData.isValid) {
    return FALLBACK_COLOR
  }

  const charCode = nameData.firstChar.charCodeAt(0)
  const colorIndex = charCode % AVATAR_COLORS.length
  return AVATAR_COLORS[colorIndex]
}

function getInitialsFromMultipleNames(nameParts: string[]): string {
  const firstInitial = nameParts[0].charAt(0).toUpperCase()
  const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase()
  return firstInitial + lastInitial
}

function getInitialsFromSingleName(name: string): string {
  if (name.length >= 2) {
    return name.charAt(0).toUpperCase() + name.charAt(1).toUpperCase()
  }
  return name.charAt(0).toUpperCase()
}

function getAvatarInitials(nameData: NormalizedNameData): string {
  if (!nameData.isValid) {
    return FALLBACK_INITIALS
  }

  const { nameParts } = nameData

  if (nameParts.length >= 2) {
    return getInitialsFromMultipleNames(nameParts)
  }

  return getInitialsFromSingleName(nameParts[0])
}

interface MissingAvatarProps {
  name: string
  size: number
  className?: string
  textSizeClass?: string
}

function getTextSizeClass(size: number): string {
  if (size >= 100) return 'text-xl'
  if (size >= 60) return 'text-base'
  if (size >= 40) return 'text-sm'
  return 'text-xs'
}

function useAbsolutePositioning(className: string): boolean {
  return className.includes('absolute') && className.includes('inset-0')
}

export function MissingAvatar({
  name,
  size,
  className = '',
  textSizeClass,
}: MissingAvatarProps) {
  const nameData = normalizeNameData(name)
  const bgColor = getAvatarColor(nameData)
  const initials = getAvatarInitials(nameData)
  const textSize = textSizeClass || getTextSizeClass(size)
  const isAbsolute = useAbsolutePositioning(className)

  return (
    <div
      className={`flex h-full w-full items-center justify-center ${bgColor} ${className}`}
      style={isAbsolute ? undefined : { width: size, height: size }}
    >
      <span className={`${textSize} leading-none font-bold text-white`}>
        {initials}
      </span>
    </div>
  )
}
