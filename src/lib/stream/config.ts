export const STREAM_CONFIG = {
  refreshInterval: 300000, // 5 minutes
  revalidate: 300, // 5 minutes

  sponsorBanner: {
    speed: 120,
    className: 'mb-8',
  },

  blueskyFeed: {
    handle: 'cloudnativebergen.dev',
    compact: true,
    title: 'Social Stream',
    speed: 180,
    maxHeight: '800px',
    className: 'h-fit',
  },

  nextTalk: {
    className: 'min-h-[200px]',
  },

  layout: {
    containerPadding: 'py-12',
    contentSpacing: 'space-y-8',
  },
} as const
