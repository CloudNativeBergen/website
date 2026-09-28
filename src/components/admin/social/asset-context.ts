import type { MarketingAssetRow } from '@/lib/marketing-asset'

/** Where an asset sits, as the picker names it under the title. */
export function assetContext(
  asset: Pick<MarketingAssetRow, 'subject' | 'scope' | 'edition'>,
): string {
  // A subject's assets come from every edition: say which one.
  if (asset.subject)
    return asset.scope === 'edition'
      ? `About ${asset.subject.name} · ${asset.edition ?? 'An edition'}`
      : `About ${asset.subject.name}`
  if (asset.scope === 'edition') return asset.edition ?? 'An edition'
  return 'Whole organization'
}
