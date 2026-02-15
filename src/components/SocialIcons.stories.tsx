import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  iconForLink,
  titleForLink,
  TwitterIcon,
  InstagramIcon,
  GitHubIcon,
  LinkedInIcon,
  BlueskyIcon,
} from './SocialIcons'

const meta = {
  title: 'Components/Icons/SocialIcons',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AllIcons: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Individual Icon Components
        </h3>
        <div className="flex items-center gap-6">
          {[
            { Icon: TwitterIcon, name: 'Twitter / X' },
            { Icon: LinkedInIcon, name: 'LinkedIn' },
            { Icon: GitHubIcon, name: 'GitHub' },
            { Icon: BlueskyIcon, name: 'Bluesky' },
            { Icon: InstagramIcon, name: 'Instagram' },
          ].map(({ Icon, name }) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <Icon className="h-8 w-8 text-gray-700 dark:text-gray-300" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          iconForLink() Helper
        </h3>
        <div className="flex items-center gap-6">
          {[
            'https://twitter.com/cloudnative',
            'https://linkedin.com/in/speaker',
            'https://github.com/cloudnativebergen',
            'https://bsky.app/profile/speaker',
            'https://instagram.com/cloudnative',
            'https://example.com/blog',
          ].map((url) => (
            <div key={url} className="flex flex-col items-center gap-2">
              <span className="text-gray-700 dark:text-gray-300">
                {iconForLink(url, 'h-8 w-8')}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {titleForLink(url)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          titleForLink() Results
        </h3>
        <table className="text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400">
              <th className="pr-8 pb-2">URL</th>
              <th className="pb-2">Title</th>
            </tr>
          </thead>
          <tbody className="text-gray-900 dark:text-white">
            {[
              'https://twitter.com/user',
              'https://x.com/user',
              'https://linkedin.com/in/user',
              'https://github.com/user',
              'https://bsky.app/profile/user',
              'https://instagram.com/user',
              'https://myblog.dev',
            ].map((url) => (
              <tr key={url}>
                <td className="py-1 pr-8 font-mono text-xs text-gray-600 dark:text-gray-400">
                  {url}
                </td>
                <td className="py-1">{titleForLink(url)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ),
}

export const Sizes: Story = {
  name: 'Icon Sizes',
  render: () => (
    <div className="flex items-end gap-8">
      {[
        { size: 'h-4 w-4', label: '16px' },
        { size: 'h-6 w-6', label: '24px' },
        { size: 'h-8 w-8', label: '32px' },
        { size: 'h-10 w-10', label: '40px' },
        { size: 'h-12 w-12', label: '48px' },
      ].map(({ size, label }) => (
        <div key={label} className="flex flex-col items-center gap-2">
          <GitHubIcon className={`${size} text-gray-700 dark:text-gray-300`} />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {label}
          </span>
        </div>
      ))}
    </div>
  ),
}
