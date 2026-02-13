export type SpinnerColor = 'indigo' | 'white' | 'blue' | 'brand'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: SpinnerColor
  className?: string
}

const colorClasses: Record<SpinnerColor, string> = {
  indigo: 'border-indigo-600 dark:border-indigo-400',
  white: 'border-white',
  blue: 'border-blue-600 dark:border-blue-400',
  brand: 'border-brand-cloud-blue dark:border-blue-400',
}

export function LoadingSpinner({
  size = 'md',
  color = 'indigo',
  className = '',
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  return (
    <div
      className={`animate-spin rounded-full border-b-2 ${colorClasses[color]} ${sizeClasses[size]} ${className}`}
    />
  )
}
