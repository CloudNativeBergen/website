import type { WholePhoto } from '@/lib/photo-wall/wall'

/**
 * The local fixture photos the Photo Wall stories show
 * (`.storybook/main.ts` staticDirs): no network. On the site a post's `src`
 * is Sanity's `rect=` square and `whole.src` the scaled whole photo; here
 * both are the fixture, which a square box's `object-cover` shows centred.
 */
export const STORY_PHOTOS = {
  landscape: {
    src: '/storybook-fixtures/wall-landscape.jpg',
    width: 1600,
    height: 1000,
  },
  portrait: {
    src: '/storybook-fixtures/wall-portrait.jpg',
    width: 1200,
    height: 1600,
  },
  photo: {
    src: '/storybook-fixtures/wall-photo.jpg',
    width: 1200,
    height: 1600,
  },
  panorama: {
    src: '/storybook-fixtures/wall-panorama.jpg',
    width: 2048,
    height: 320,
  },
  tall: { src: '/storybook-fixtures/wall-tall.jpg', width: 320, height: 2048 },
} as const satisfies Record<string, WholePhoto>

/** A post's `src` and `whole` from one fixture photo. */
export const storyPhoto = (photo: WholePhoto) => ({
  src: photo.src,
  whole: { ...photo },
})
