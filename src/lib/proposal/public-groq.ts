/**
 * Public read projections as pure GROQ strings, shared by the site and the
 * program subgraph (services/program, #1772) so both return the same shape.
 * Each needs `$conferenceId` bound; the caller's root filter carries the
 * tenant predicate.
 */
import { SPEAKER_IMAGE_URL } from '../speaker/image-groq'
import { OFFICIAL_SCHEDULE_FILTER } from '../speaker/schedule-groq'

/** A confirmed talk on the public speaker profile (listPublicTalks, toPublicTalk). */
export const PUBLIC_TALK_FIELDS = `_id, title, description, language, level, format, audiences,
          attachments[]{
            ...,
            _type == "fileAttachment" => {
              "url": file.asset->url
            }
          },
          speakers[]-> {
            _id, name, title, "slug": slug.current, "image": ${SPEAKER_IMAGE_URL}
          },
          topics[]-> {
            _id, title, color, "slug": slug.current
          },
          "scheduleInfo": {
            "talkId": _id,
            "schedule": *[_type == "schedule" && conference._ref == $conferenceId && ${/* groq-global-scoped: conference._ref == $conferenceId on this root; the interpolation is a status constant */ OFFICIAL_SCHEDULE_FILTER} && ^._id in tracks[].talks[].talk._ref] | order(date asc) [0]
          } {
            "date": schedule.date,
            "trackTitle": schedule.tracks[^.talkId in talks[].talk._ref][0].trackTitle,
            "timeSlot": schedule.tracks[^.talkId in talks[].talk._ref][0].talks[talk._ref == ^.talkId][0]{
              startTime,
              endTime
            }
          }`

/** A speaker's gallery photos in the conference (getPublicSpeaker). */
export const PUBLIC_SPEAKER_GALLERY = `*[_type == "imageGallery" && conference._ref == $conferenceId && ^._id in speakers[]._ref] {
          _id,
          _rev,
          _createdAt,
          _updatedAt,
          image{asset, hotspot, crop, alt},
          "imageUrl": image.asset->url,
          "imageAlt": image.alt,
          photographer,
          date,
          location,
          featured,
          speakers[]->{_id, name, "slug": slug.current, image}
        } | order(featured desc, date desc)`

/** One schedule day's tracks on the public programme (EXPANDED_SCHEDULES). */
export const SCHEDULE_TRACKS = `tracks[]{
        trackTitle,
        trackDescription,
        sponsor,
        talks[]{
        startTime,
        endTime,
        placeholder,
        "hasTalkRef": defined(talk),
        talk->{
          _id,
          format,
          level,
          status,
          // Whether, never which: the programme's "Give feedback" link looks
          // the code up when followed (#1472), so it never rides this read.
          "hasFeedbackCode": defined(feedbackCode),
          audiences,
          topics[]-> {
            _id,
            title,
            color,
            slug,
            description
          },
          // Only a confirmed talk ships its title, description and speakers.
          // Any other talk keeps its slot on the public programme (shown as
          // TBA), but an unconfirmed proposal or a speaker who withdrew is
          // never named.
          status == "confirmed" => {
            title,
            description,
            language,
            speakers[]->{
            _id,
            name,
            "slug": slug.current,
            title,
            "image": ${SPEAKER_IMAGE_URL}
            }
          }
        }
        }
      }`
