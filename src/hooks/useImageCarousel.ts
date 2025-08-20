import { useState, useEffect, useCallback, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

interface UseImageCarouselOptions {
  totalImages: number;
  initialIndex?: number;
  autoPlayInterval?: number;
  enableAutoPlay?: boolean;
  enableKeyboard?: boolean;
  enableTouch?: boolean;
  globalKeyboard?: boolean;
  navigationThrottleMs?: number;
  onIndexChange?: (index: number) => void;
  onEscape?: () => void;
}

interface UseImageCarouselReturn {
  currentIndex: number;
  goToNext: () => void;
  goToPrevious: () => void;
  goToIndex: (index: number) => void;
  isFirst: boolean;
  isLast: boolean;
  startAutoPlay: () => void;
  stopAutoPlay: () => void;
  isAutoPlaying: boolean;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleKeyDownReact: (event: ReactKeyboardEvent) => void;
  handleTouchStart: (event: TouchEvent) => void;
  handleTouchMove: (event: TouchEvent) => void;
  handleTouchEnd: () => void;
}

export function useImageCarousel({
  totalImages,
  initialIndex = 0,
  autoPlayInterval = 5000,
  enableAutoPlay = false,
  enableKeyboard = true,
  enableTouch = true,
  globalKeyboard = false,
  navigationThrottleMs = 200,
  onIndexChange,
  onEscape,
}: UseImageCarouselOptions): UseImageCarouselReturn {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isAutoPlaying, setIsAutoPlaying] = useState(enableAutoPlay);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const touchEndRef = useRef<number | null>(null);
  const lastNavigationTime = useRef<number>(0);
  const throttleDelay = navigationThrottleMs;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalImages - 1;

  const goToNext = useCallback(() => {
    const now = Date.now();
    if (now - lastNavigationTime.current < throttleDelay) return;
    lastNavigationTime.current = now;
    
    setCurrentIndex((prevIndex) => {
      const newIndex = prevIndex === totalImages - 1 ? 0 : prevIndex + 1;
      onIndexChange?.(newIndex);
      return newIndex;
    });
  }, [totalImages, onIndexChange]);

  const goToPrevious = useCallback(() => {
    const now = Date.now();
    if (now - lastNavigationTime.current < throttleDelay) return;
    lastNavigationTime.current = now;
    
    setCurrentIndex((prevIndex) => {
      const newIndex = prevIndex === 0 ? totalImages - 1 : prevIndex - 1;
      onIndexChange?.(newIndex);
      return newIndex;
    });
  }, [totalImages, onIndexChange]);

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalImages) {
        setCurrentIndex(index);
        onIndexChange?.(index);
      }
    },
    [totalImages, onIndexChange]
  );

  const startAutoPlay = useCallback(() => {
    setIsAutoPlaying(true);
  }, []);

  const stopAutoPlay = useCallback(() => {
    setIsAutoPlaying(false);
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enableKeyboard) return;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          event.preventDefault();
          goToNext();
          break;
        case 'Escape':
          if (onEscape) {
            event.preventDefault();
            onEscape();
          }
          break;
      }
    },
    [enableKeyboard, goToNext, goToPrevious, onEscape]
  );

  const handleKeyDownReact = useCallback(
    (event: ReactKeyboardEvent) => {
      if (!enableKeyboard) return;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          event.preventDefault();
          goToNext();
          break;
        case 'Escape':
          if (onEscape) {
            event.preventDefault();
            onEscape();
          }
          break;
      }
    },
    [enableKeyboard, goToNext, goToPrevious, onEscape]
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!enableTouch) return;
      touchStartRef.current = event.targetTouches[0].clientX;
    },
    [enableTouch]
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!enableTouch) return;
      touchEndRef.current = event.targetTouches[0].clientX;
    },
    [enableTouch]
  );

  const handleTouchEnd = useCallback(() => {
    if (!enableTouch) return;
    
    if (touchStartRef.current == null || touchEndRef.current == null) return;

    const diff = touchStartRef.current - touchEndRef.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }

    touchStartRef.current = null;
    touchEndRef.current = null;
  }, [enableTouch, goToNext, goToPrevious]);

  // Update currentIndex when initialIndex changes
  useEffect(() => {
    const clampedIndex = Math.min(Math.max(0, initialIndex), totalImages - 1);
    if (clampedIndex !== currentIndex) {
      setCurrentIndex(clampedIndex);
      onIndexChange?.(clampedIndex);
    }
  }, [initialIndex, totalImages, onIndexChange]);

  // Sync auto-play state with prop changes
  useEffect(() => {
    setIsAutoPlaying(enableAutoPlay);
  }, [enableAutoPlay]);

  // Clamp currentIndex when totalImages changes
  useEffect(() => {
    if (currentIndex >= totalImages && totalImages > 0) {
      const newIndex = totalImages - 1;
      setCurrentIndex(newIndex);
      onIndexChange?.(newIndex);
    }
  }, [totalImages, currentIndex, onIndexChange]);

  useEffect(() => {
    if (isAutoPlaying && totalImages > 1) {
      autoPlayRef.current = setInterval(goToNext, autoPlayInterval);
      return () => {
        if (autoPlayRef.current) {
          clearInterval(autoPlayRef.current);
        }
      };
    }
  }, [isAutoPlaying, goToNext, autoPlayInterval, totalImages]);

  useEffect(() => {
    if (enableKeyboard && globalKeyboard) {
      const handleGlobalKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => {
        window.removeEventListener('keydown', handleGlobalKeyDown);
      };
    }
  }, [enableKeyboard, globalKeyboard, handleKeyDown]);

  return {
    currentIndex,
    goToNext,
    goToPrevious,
    goToIndex,
    isFirst,
    isLast,
    startAutoPlay,
    stopAutoPlay,
    isAutoPlaying,
    handleKeyDown,
    handleKeyDownReact,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}