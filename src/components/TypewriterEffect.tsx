'use client'

import { useState, useEffect, useCallback } from 'react'

interface TypewriterEffectProps {
  /** Static text shown before the animated word */
  prefix: string
  /** Array of words to cycle through */
  words: string[]
  /** Enable/disable typing animation (default: true) */
  animation?: boolean
  /** Milliseconds per character when typing (default: 100) */
  typingSpeed?: number
  /** Milliseconds per character when deleting (default: 50) */
  deletingSpeed?: number
  /** Milliseconds to pause after word is complete (default: 2000) */
  pauseDuration?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Accessible typewriter effect component.
 *
 * Best practices implemented:
 * - Full text is always in DOM for SEO and screen readers
 * - Uses aria-label for complete message, aria-hidden for visual animation
 * - Respects prefers-reduced-motion preference
 * - Keeps cursor blink subtle to avoid vestibular issues
 */
export function TypewriterEffect({
  prefix,
  words,
  animation = true,
  typingSpeed = 100,
  deletingSpeed = 50,
  pauseDuration = 2000,
  className,
}: TypewriterEffectProps) {
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [currentText, setCurrentText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  const currentWord = words[currentWordIndex]
  const fullText = `${prefix}${words.join('. ')}`.replace(/\.\./, '.')
  const isAnimationDisabled = !animation || prefersReducedMotion

  // Listen for reduced motion preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const handleTyping = useCallback(() => {
    if (isAnimationDisabled) return

    if (isDeleting) {
      if (currentText.length > 0) {
        setCurrentText((prev) => prev.slice(0, -1))
      } else {
        setIsDeleting(false)
        setCurrentWordIndex((prev) => (prev + 1) % words.length)
      }
    } else {
      if (currentText.length < currentWord.length) {
        setCurrentText((prev) => currentWord.slice(0, prev.length + 1))
      } else {
        setTimeout(() => setIsDeleting(true), pauseDuration)
        return
      }
    }
  }, [
    currentText,
    currentWord,
    isDeleting,
    words.length,
    pauseDuration,
    isAnimationDisabled,
  ])

  useEffect(() => {
    if (isAnimationDisabled) return

    const speed = isDeleting ? deletingSpeed : typingSpeed
    const timer = setTimeout(handleTyping, speed)
    return () => clearTimeout(timer)
  }, [
    handleTyping,
    isDeleting,
    typingSpeed,
    deletingSpeed,
    isAnimationDisabled,
  ])

  // For disabled animation or reduced motion: show static text with all words
  if (isAnimationDisabled) {
    return (
      <span className={className}>
        {prefix}
        {words.join('. ')}
      </span>
    )
  }

  return (
    <span className={className} aria-label={fullText}>
      {/* Visual animation - hidden from screen readers */}
      <span aria-hidden="true">
        {prefix}
        <span className="inline-block min-w-[1ch]">{currentText}</span>
        <span className="animate-blink ml-0.5 inline-block h-[1em] w-0.75 translate-y-[0.1em] bg-current" />
      </span>
      {/* Screen reader text - visually hidden but accessible */}
      <span className="sr-only">{fullText}</span>
    </span>
  )
}
