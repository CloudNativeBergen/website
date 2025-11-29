import React from 'react'
import { StarIcon, StarIcon as StarIconSolid } from '@heroicons/react/24/solid'

interface RatingDisplayProps {
  rating: number
  reviewCount: number
  size?: 'sm' | 'md'
  showText?: boolean
  className?: string
}

export function RatingDisplay({
  rating,
  reviewCount,
  size = 'md',
  showText = true,
  className = '',
}: RatingDisplayProps) {
  const starSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const textSize = size === 'sm' ? 'text-xs' : 'text-xs'

  if (reviewCount === 0) return null

  return (
    <div className={`flex items-center ${textSize} text-gray-500 ${className}`}>
      <div className="mr-2 flex items-center">
        {[1, 2, 3, 4, 5].map((star) =>
          star <= Math.round(rating) ? (
            <StarIconSolid
              key={star}
              className={`${starSize} text-yellow-400`}
            />
          ) : (
            <StarIcon key={star} className={`${starSize} text-gray-300`} />
          ),
        )}
      </div>
      {showText && (
        <span>
          {rating.toFixed(1)} ({reviewCount} review
          {reviewCount !== 1 ? 's' : ''})
        </span>
      )}
    </div>
  )
}

interface MetadataRowProps {
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  children: React.ReactNode
  className?: string
}

export function MetadataRow({
  icon: Icon,
  children,
  className = '',
}: MetadataRowProps) {
  return (
    <div className={`flex items-center text-sm text-gray-500 ${className}`}>
      {Icon && <Icon className="mr-1 h-4 w-4 shrink-0" />}
      <span className="truncate">{children}</span>
    </div>
  )
}
