/**
 * @vitest-environment jsdom
 *
 * My posts (Photo Wall spec §5.1, §12): each of this phone's posts with its
 * status, Delete behind an inline confirm, the Marketing switch, and the
 * "Couldn't delete. Try again." state of a `deleting` post with Delete
 * still offered. The actions stand in for the Server Actions.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyPost } from '@/lib/photo-wall/my-posts'
import { MyPosts, type MyPostsProps } from './MyPosts'

let n = 0
const post = (fields: Partial<MyPost> = {}): MyPost => ({
  _id: `wallPost-${++n}`,
  status: 'pending',
  src: `https://cdn.sanity.io/images/p/d/${n}.jpg?rect=0,0,10,10`,
  caption: `Caption ${n}`,
  name: 'Ada',
  marketingConsent: false,
  submittedAt: '2026-10-26T09:00:00Z',
  incarnation: { createdAt: '2026-10-26T09:00:00.000Z', assetId: 'image-a' },
  ...fields,
})

const onDelete = vi.fn<MyPostsProps['onDelete']>()
const onMarketing = vi.fn<MyPostsProps['onMarketing']>()

beforeEach(() => {
  n = 0
  onDelete.mockReset().mockResolvedValue('deleted')
  onMarketing.mockReset().mockResolvedValue('done')
})

const card = (caption: string) =>
  within(screen.getByRole('listitem', { name: caption }))

describe('MyPosts', () => {
  it('shows each post as a plain <img> of its Sanity URL, with its caption, name and status', () => {
    render(
      <MyPosts
        posts={[
          post({ caption: 'Waiting', status: 'pending' }),
          post({ caption: 'Up', status: 'approved', name: null }),
          post({ caption: 'Down', status: 'notShown' }),
        ]}
        onDelete={onDelete}
        onMarketing={onMarketing}
      />,
    )
    expect(card('Waiting').getByText('Waiting for approval')).toBeVisible()
    expect(card('Up').getByText('On the wall')).toBeVisible()
    expect(card('Down').getByText('Not shown')).toBeVisible()
    const img = card('Waiting').getByRole('img', {
      name: 'Your photo: Waiting',
    })
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute(
      'src',
      'https://cdn.sanity.io/images/p/d/1.jpg?rect=0,0,10,10',
    )
    expect(card('Waiting').getByText('— Ada')).toBeVisible()
    expect(card('Up').queryByText(/— /)).toBeNull()
  })

  it('a deleting post says the delete did not finish, shows no photo, offers Delete and no Marketing switch', () => {
    render(
      <MyPosts
        posts={[post({ caption: 'Stuck', status: 'deleting', src: null })]}
        onDelete={onDelete}
        onMarketing={onMarketing}
      />,
    )
    const stuck = card('Stuck')
    expect(stuck.getByText('Couldn’t delete. Try again.')).toBeVisible()
    expect(stuck.queryByRole('img')).toBeNull()
    expect(stuck.getByRole('button', { name: 'Delete' })).toBeVisible()
    expect(stuck.queryByRole('switch')).toBeNull()
  })

  it('Delete asks first, in place; Cancel keeps the post and hands focus back to Delete', async () => {
    render(
      <MyPosts
        posts={[post({ caption: 'Keep' })]}
        onDelete={onDelete}
        onMarketing={onMarketing}
      />,
    )
    const keep = card('Keep')
    fireEvent.click(keep.getByRole('button', { name: 'Delete' }))
    expect(
      keep.getByText(
        'Delete this photo? It’s removed from the wall and can’t be undone.',
      ),
    ).toBeVisible()
    expect(onDelete).not.toHaveBeenCalled()
    const cancel = keep.getByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()
    fireEvent.click(cancel)
    expect(keep.queryByText(/Delete this photo/)).toBeNull()
    expect(keep.getByRole('button', { name: 'Delete' })).toHaveFocus()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('confirming deletes that post, saying Deleting… meanwhile', async () => {
    let finish: (status: 'deleted') => void = () => {}
    onDelete.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    )
    const posts = [post({ caption: 'Gone' }), post({ caption: 'Stays' })]
    render(
      <MyPosts posts={posts} onDelete={onDelete} onMarketing={onMarketing} />,
    )
    const gone = card('Gone')
    fireEvent.click(gone.getByRole('button', { name: 'Delete' }))
    fireEvent.click(gone.getByRole('button', { name: 'Delete this photo' }))
    expect(onDelete).toHaveBeenCalledWith(posts[0])
    expect(gone.getByRole('button', { name: 'Deleting…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    // A second press while it goes out does nothing.
    fireEvent.click(gone.getByRole('button', { name: 'Deleting…' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    await act(async () => finish('deleted'))
    expect(card('Stays').getByRole('button', { name: 'Delete' })).toBeVisible()
  })

  it('a failed delete says so on the card, with Delete offered again; the next press asks again', async () => {
    onDelete.mockResolvedValueOnce('failed').mockResolvedValueOnce('deleted')
    render(
      <MyPosts
        posts={[post({ caption: 'Flaky' })]}
        onDelete={onDelete}
        onMarketing={onMarketing}
      />,
    )
    const flaky = card('Flaky')
    fireEvent.click(flaky.getByRole('button', { name: 'Delete' }))
    await act(async () => {
      fireEvent.click(flaky.getByRole('button', { name: 'Delete this photo' }))
    })
    expect(flaky.getByText('Couldn’t delete. Try again.')).toBeVisible()
    expect(flaky.queryByText(/Delete this photo\?/)).toBeNull()
    fireEvent.click(flaky.getByRole('button', { name: 'Delete' }))
    await act(async () => {
      fireEvent.click(flaky.getByRole('button', { name: 'Delete this photo' }))
    })
    expect(onDelete).toHaveBeenCalledTimes(2)
  })

  it('an action that throws reads as a failure, never an unhandled rejection', async () => {
    onDelete.mockRejectedValueOnce(new Error('offline'))
    render(
      <MyPosts
        posts={[post({ caption: 'Offline' })]}
        onDelete={onDelete}
        onMarketing={onMarketing}
      />,
    )
    const offline = card('Offline')
    fireEvent.click(offline.getByRole('button', { name: 'Delete' }))
    await act(async () => {
      fireEvent.click(
        offline.getByRole('button', { name: 'Delete this photo' }),
      )
    })
    expect(offline.getByText('Couldn’t delete. Try again.')).toBeVisible()
  })

  it('the Marketing switch shows the stored consent and sends the other value', async () => {
    render(
      <MyPosts
        posts={[
          post({ caption: 'Yes', marketingConsent: true }),
          post({ caption: 'No', marketingConsent: false }),
        ]}
        onDelete={onDelete}
        onMarketing={onMarketing}
      />,
    )
    const yes = card('Yes').getByRole('switch', { name: 'Marketing' })
    const no = card('No').getByRole('switch', { name: 'Marketing' })
    expect(yes).toHaveAttribute('aria-checked', 'true')
    expect(no).toHaveAttribute('aria-checked', 'false')
    await act(async () => {
      fireEvent.click(yes)
    })
    expect(onMarketing).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'Yes' }),
      false,
    )
    await act(async () => {
      fireEvent.click(no)
    })
    expect(onMarketing).toHaveBeenLastCalledWith(
      expect.objectContaining({ caption: 'No' }),
      true,
    )
  })

  it('a Marketing change that did not go through says so and keeps the stored value', async () => {
    onMarketing.mockResolvedValueOnce('changed')
    render(
      <MyPosts
        posts={[post({ caption: 'Raced', marketingConsent: true })]}
        onDelete={onDelete}
        onMarketing={onMarketing}
      />,
    )
    const raced = card('Raced')
    await act(async () => {
      fireEvent.click(raced.getByRole('switch', { name: 'Marketing' }))
    })
    expect(raced.getByText('Couldn’t change. Try again.')).toBeVisible()
    expect(raced.getByRole('switch', { name: 'Marketing' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})
