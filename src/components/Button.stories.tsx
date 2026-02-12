import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Button } from './Button'
import {
  CalendarIcon,
  UserIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Consistent, accessible button system with clear visual hierarchy. Supports multiple variants (primary, secondary, success, warning, info, outline, icon) following the brand color system. Available in four sizes (sm, md, lg, icon) with loading states and icon support. Maintains WCAG 2.1 AA compliance with proper focus states.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'success', 'warning', 'info', 'outline', 'icon'],
      description: 'Visual style variant following brand color system',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'icon'],
      description: 'Button size - use "icon" size for icon-only buttons',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable button interaction',
    },
    children: {
      control: 'text',
      description: 'Button content - text or JSX elements',
    },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Button',
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
  },
}

export const Success: Story = {
  args: {
    variant: 'success',
    children: 'Success Button',
  },
}

export const Warning: Story = {
  args: {
    variant: 'warning',
    children: 'Warning Button',
  },
}

export const Info: Story = {
  args: {
    variant: 'info',
    children: 'Info Button',
  },
}

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline Button',
  },
}

export const WithIcon: Story = {
  args: {
    variant: 'primary',
    children: (
      <>
        <CalendarIcon className="mr-2 h-5 w-5" />
        Schedule Event
      </>
    ),
  },
}

export const IconOnly: Story = {
  args: {
    variant: 'icon',
    size: 'icon',
    children: <UserIcon className="h-5 w-5" />,
  },
}

export const Small: Story = {
  args: {
    variant: 'primary',
    size: 'sm',
    children: 'Small Button',
  },
}

export const Medium: Story = {
  args: {
    variant: 'primary',
    size: 'md',
    children: 'Medium Button',
  },
}

export const Large: Story = {
  args: {
    variant: 'primary',
    size: 'lg',
    children: 'Large Button',
  },
}

export const Disabled: Story = {
  args: {
    variant: 'primary',
    disabled: true,
    children: 'Disabled Button',
  },
}

// Interaction Tests
export const ClickInteraction: Story = {
  args: {
    variant: 'primary',
    children: 'Click Me',
    onClick: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: /click me/i })

    // Test button is visible and enabled
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()

    // Test click interaction
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledTimes(1)

    // Test double click
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledTimes(2)
  },
}

export const DisabledInteraction: Story = {
  args: {
    variant: 'primary',
    disabled: true,
    children: 'Disabled Button',
    onClick: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: /disabled button/i })

    // Test button is visible but disabled
    await expect(button).toBeVisible()
    await expect(button).toBeDisabled()

    // Attempt to click - should not trigger onClick
    await userEvent.click(button)
    await expect(args.onClick).not.toHaveBeenCalled()
  },
}

export const KeyboardNavigation: Story = {
  args: {
    variant: 'primary',
    children: 'Press Enter',
    onClick: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: /press enter/i })

    // Focus the button
    button.focus()
    await expect(button).toHaveFocus()

    // Press Enter to activate
    await userEvent.keyboard('{Enter}')
    await expect(args.onClick).toHaveBeenCalledTimes(1)

    // Press Space to activate
    await userEvent.keyboard(' ')
    await expect(args.onClick).toHaveBeenCalledTimes(2)
  },
}

export const HoverState: Story = {
  args: {
    variant: 'primary',
    children: 'Hover Over Me',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: /hover over me/i })

    // Test hover interaction (visual change verified by Chromatic)
    await userEvent.hover(button)
    await expect(button).toBeVisible()

    await userEvent.unhover(button)
    await expect(button).toBeVisible()
  },
}
