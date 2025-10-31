# Privacy-Preserving Video Embeds

This directory contains utilities for embedding videos from YouTube and Vimeo in a privacy-preserving manner, compliant with GDPR and Norwegian ekomloven requirements.

## Privacy Features

### YouTube Embeds

- Uses `youtube-nocookie.com` domain instead of `youtube.com`
- **No tracking cookies** are set until the user actually plays the video
- Reduces passive tracking while preserving full functionality
- All YouTube features (fullscreen, playback controls, etc.) work normally

### Vimeo Embeds

- Includes `dnt=1` (Do Not Track) parameter
- Disables Vimeo's tracking and analytics
- Respects user privacy while maintaining video functionality

## Components

### `VideoEmbed`

React component for embedding videos with automatic privacy enhancements.

```tsx
import { VideoEmbed } from '@/components/VideoEmbed'
;<VideoEmbed
  url="https://www.youtube.com/watch?v=VIDEO_ID"
  title="Talk Recording"
  className="my-4"
/>
```

**Props:**

- `url` (required): The YouTube or Vimeo URL
- `title` (optional): Accessible title for the iframe (default: "Video")
- `className` (optional): Additional CSS classes

### Utility Functions

Located in `/src/lib/video/utils.ts`:

#### `extractYouTubeId(url: string): string | null`

Extracts video ID from various YouTube URL formats:

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`

#### `extractVimeoId(url: string): string | null`

Extracts video ID from Vimeo URLs:

- `https://vimeo.com/VIDEO_ID`
- `https://player.vimeo.com/video/VIDEO_ID`

#### `getVideoPlatform(url: string): 'youtube' | 'vimeo' | null`

Determines which platform a URL belongs to.

## Usage in ProposalPublishedContent

The admin interface automatically displays embedded videos for accepted/confirmed talks after the conference has ended. Videos are embedded using the privacy-preserving methods described above.

## GDPR Compliance

These implementations align with:

- **GDPR Article 5(1)(c)**: Data minimization - only essential cookies/tracking
- **ekomloven § 2-7 b**: Requires opt-in consent for non-essential cookies
- **Privacy by design**: Default configuration minimizes data collection

### Legal Basis

- Video embeds use **legitimate interests** (Art. 6(1)(f)) as the legal basis
- The privacy-enhanced modes ensure minimal impact on user privacy
- No additional consent required beyond the site's cookie banner for essential functionality

## Testing

To test the embeds:

1. Navigate to an accepted talk's admin page after the conference end date
2. Add a YouTube or Vimeo URL to the recording field
3. The video should automatically embed with privacy features enabled
4. Verify in browser dev tools that no cookies are set before playing the video

## Technical Details

### YouTube-nocookie.com

- This is an official YouTube domain specifically for privacy-conscious embeds
- Hosted by Google/YouTube with the same reliability as regular YouTube
- No cookies until playback starts
- Referrer information is still sent (required for video loading)

### Vimeo DNT

- The `dnt=1` parameter is officially supported by Vimeo
- Disables session cookies and analytics tracking
- Video playback and basic features remain fully functional

## Future Enhancements

Potential improvements:

- [ ] Add consent-based embeds (click-to-load) for even more privacy
- [ ] Support additional video platforms (e.g., PeerTube, self-hosted)
- [ ] Add lazy loading with intersection observer
- [ ] Provide fallback link if JavaScript is disabled
- [ ] Add option to show thumbnail with manual activation

## References

- [YouTube Privacy-Enhanced Mode](https://support.google.com/youtube/answer/171780)
- [Vimeo Privacy Settings](https://vimeo.com/blog/post/privacy-first-video-embeds/)
- [GDPR Article 5](https://gdpr-info.eu/art-5-gdpr/)
- [Norwegian ekomloven](https://lovdata.no/dokument/NL/lov/2003-07-04-83)
