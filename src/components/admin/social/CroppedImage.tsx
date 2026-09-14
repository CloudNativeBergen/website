import type { NormalizedRect } from '@/lib/social/rendition'

/**
 * A source image shown through a normalized crop window, cropped in CSS.
 * The preview must not depend on the CDN honouring `rect` (or on the asset
 * existing at all, as in Storybook), so the window is applied here and the
 * CDN rendition URL is what the adapter fetches.
 *
 * With `aspectRatio` the box takes that shape and the window COVERS it
 * (centred, overflow hidden), the way a feed grid tiles images of another
 * shape; without it the box takes the window's own shape.
 */
export function CroppedImage({
  src,
  alt,
  rect,
  sourceAspect,
  aspectRatio,
  className,
}: {
  src: string
  alt: string
  rect: NormalizedRect
  /** Source pixel aspect (width / height); needed to size the window. */
  sourceAspect: number
  /** Box aspect (width / height); defaults to the window's own aspect. */
  aspectRatio?: number
  className?: string
}) {
  const windowAspect = (rect.width * sourceAspect) / rect.height
  const box = aspectRatio ?? windowAspect
  // The window, scaled to cover the box.
  const cover =
    windowAspect > box
      ? { height: '100%', width: `${(windowAspect / box) * 100}%` }
      : { width: '100%', height: `${(box / windowAspect) * 100}%` }
  return (
    <div
      className={className}
      style={{ position: 'relative', overflow: 'hidden', aspectRatio: box }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          overflow: 'hidden',
          ...cover,
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            position: 'absolute',
            maxWidth: 'none',
            width: `${100 / rect.width}%`,
            height: `${100 / rect.height}%`,
            left: `${(-rect.x / rect.width) * 100}%`,
            top: `${(-rect.y / rect.height) * 100}%`,
            objectFit: 'fill',
          }}
        />
      </div>
    </div>
  )
}
