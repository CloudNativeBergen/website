import speakingurl from 'speakingurl'
import { useDocumentOperation } from 'sanity'

export function slugOnSave(originalPublishAction) {
  const BetterAction = (props) => {
    const { patch } = useDocumentOperation(props.id, props.type)
    const patchSlug = (slugValue) => {
      patch.execute([{ set: { slug: { current: slugValue, _type: 'slug' } } }])
    }
    const originalResult = originalPublishAction(props)
    return {
      ...originalResult,
      onHandle: async () => {
        if (!props.draft || props.type !== 'speaker') {
          return originalResult.onHandle()
        }

        if (props.draft.name && !props.published?.slug?.current) {
          const generatedSlug = props.draft.name
            ? defaultSlugify(props.draft.name)
            : null

          if (generatedSlug) {
            patchSlug(generatedSlug)
          }
        }

        originalResult.onHandle()
      },
    }
  }
  return BetterAction
}

const defaultSlugify = (value) => {
  const slugifyOpts = { truncate: 200, symbols: true }
  return value ? speakingurl(value, slugifyOpts) : ''
}
