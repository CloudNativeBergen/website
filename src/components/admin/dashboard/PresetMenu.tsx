'use client'

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Squares2X2Icon } from '@heroicons/react/24/outline'
import { ALL_PRESETS, PRESET_KEYS } from '@/lib/dashboard/presets'
import { DEFAULT_PRESET_KEY } from '@/lib/dashboard/constants'

interface PresetMenuProps {
  /** Called with the chosen preset key. The caller confirms before applying. */
  onSelect: (presetKey: string) => void
}

/**
 * Floating edit-mode control that lists every dashboard preset. Selecting one
 * hands the key to the caller, which shows a confirmation before replacing the
 * layout (applying a preset is destructive). This control subsumes the old
 * standalone "Reset" button: the default (Planning) preset is marked as such.
 */
export function PresetMenu({ onSelect }: PresetMenuProps) {
  return (
    <Menu as="div" className="relative">
      <MenuButton className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-lg transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
        <Squares2X2Icon className="h-3.5 w-3.5" />
        Layout
      </MenuButton>

      {/* Controls sit fixed at the bottom-right, so the panel opens upward. */}
      <MenuItems className="absolute right-0 bottom-full z-50 mb-2 w-72 origin-bottom-right rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl focus:outline-none dark:border-gray-600 dark:bg-gray-800">
        <p className="px-2.5 pt-1.5 pb-2 text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
          Apply a preset layout
        </p>
        {PRESET_KEYS.map((key) => {
          const preset = ALL_PRESETS[key]
          return (
            <MenuItem key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                className="block w-full rounded-lg px-2.5 py-2 text-left data-focus:bg-gray-100 dark:data-focus:bg-gray-700"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {preset.name}
                  {key === DEFAULT_PRESET_KEY && (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      Default
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-gray-500 dark:text-gray-400">
                  {preset.description}
                </span>
              </button>
            </MenuItem>
          )
        })}
      </MenuItems>
    </Menu>
  )
}
