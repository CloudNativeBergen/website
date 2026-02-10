/**
 * Widget Metadata System
 *
 * Defines how widgets present themselves to the dashboard ecosystem.
 * Each widget declares its sizing preferences, constraints, and metadata.
 */

import type { ConferencePhase } from '@/lib/conference/phase'
import type { WidgetConfigSchema } from './types'

export interface WidgetSizePreset {
  /** Preset name for UI display */
  name: 'compact' | 'small' | 'medium' | 'large' | 'wide' | 'full'
  /** Number of columns to span */
  colSpan: number
  /** Number of rows to span */
  rowSpan: number
  /** Optional description of this preset */
  description?: string
}

export interface WidgetSizeConstraints {
  /** Minimum columns this widget can occupy */
  minCols: number
  /** Maximum columns this widget can occupy */
  maxCols: number
  /** Minimum rows this widget can occupy */
  minRows: number
  /** Maximum rows this widget can occupy */
  maxRows: number
  /** Preferred aspect ratio (width/height), if any */
  aspectRatio?: number
  /** Whether this widget works best in landscape orientation */
  prefersLandscape?: boolean
  /** Whether this widget works best in portrait orientation */
  prefersPortrait?: boolean
}

/**
 * Configuration for phase-aware widget behavior
 */
export interface WidgetPhaseConfig {
  /** Phases where this widget is most relevant */
  relevantPhases: ConferencePhase[]
  /** Whether widget should be hidden in irrelevant phases */
  hideInIrrelevantPhases?: boolean
  /** Whether widget adapts its display based on phase */
  isPhaseAdaptive?: boolean
  /** Optional phase-specific titles */
  phaseTitles?: Partial<Record<ConferencePhase, string>>
}

export interface WidgetMetadata {
  /** Unique widget type identifier */
  type: string
  /** Display name for widget picker */
  displayName: string
  /** Brief description of widget functionality */
  description: string
  /** Category for grouping in widget picker */
  category: 'core' | 'analytics' | 'operations' | 'engagement'
  /** Icon name (from Heroicons) */
  icon: string
  /** Default size when widget is first added */
  defaultSize: WidgetSizePreset
  /** All available size presets for this widget */
  availableSizes: WidgetSizePreset[]
  /** Size constraints for custom resizing */
  constraints: WidgetSizeConstraints
  /** Whether this widget requires real-time updates */
  requiresRealtime?: boolean
  /** Whether this widget should be available in the widget picker */
  isAvailable?: boolean
  /** Tags for search/filtering */
  tags?: string[]
  /** Optional phase configuration for adaptive behavior */
  phaseConfig?: WidgetPhaseConfig
  /** Optional configuration schema for widget settings */
  configSchema?: WidgetConfigSchema
}

/**
 * Helper to create a widget metadata definition with type safety
 */
export function defineWidget(metadata: WidgetMetadata): WidgetMetadata {
  return {
    ...metadata,
    isAvailable: metadata.isAvailable ?? true,
  }
}
