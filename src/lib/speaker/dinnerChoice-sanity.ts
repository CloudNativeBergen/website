/** Reads and writes for `speakerDinnerChoice` (#1592, phase 5). */
import { groq } from 'next-sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import type { SpeakerInfoRoute } from '@/lib/conference/types'
import { dinnerChoiceId } from './dinnerChoice'

type Routes = SpeakerInfoRoute[] | null

/** The speaker's stored choice, as written (not checked against routes). */
export async function getDinnerChoice(
  conferenceId: string,
  speakerId: string,
): Promise<string | null> {
  return clientReadUncached.fetch<string | null>(
    // groq-global-scoped: the id embeds the domain conference and the caller.
    groq`*[_type == "speakerDinnerChoice" && _id == $id][0].choice`,
    { id: dinnerChoiceId(conferenceId, speakerId) },
  )
}

/** What `speaker.setDinnerChoice` checks before it writes. */
export async function getDinnerChoiceContext(
  conferenceId: string,
  speakerId: string,
): Promise<{ routes: Routes; hasConfirmedTalk: boolean }> {
  return clientReadUncached.fetch(
    // groq-global-scoped: every root is keyed on $conferenceId, the domain conference.
    groq`{
      "routes": *[_type == "conference" && _id == $conferenceId][0].speakerInfo.dinner.routes[]{ _key, label },
      "hasConfirmedTalk": count(*[_type == "talk" && conference._ref == $conferenceId && status == "confirmed" && $speakerId in speakers[]._ref && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]) > 0
    }`,
    { conferenceId, speakerId },
  )
}

export async function setDinnerChoice(
  conferenceId: string,
  speakerId: string,
  choice: string,
): Promise<void> {
  await clientWrite.createOrReplace({
    _id: dinnerChoiceId(conferenceId, speakerId),
    _type: 'speakerDinnerChoice',
    conference: { _type: 'reference', _ref: conferenceId },
    speaker: { _type: 'reference', _ref: speakerId },
    choice,
    updatedAt: new Date().toISOString(),
  })
}

/** Routes, confirmed speakers and every stored choice, for the summary. */
export async function getDinnerChoiceSummaryInputs(
  conferenceId: string,
): Promise<{
  routes: Routes
  /** `null` where a talk references a deleted speaker. */
  speakers: ({ _id: string; name?: string; email?: string } | null)[]
  choices: { speakerId: string; choice: string }[]
}> {
  return clientReadUncached.fetch(
    // groq-global-scoped: every root is keyed on $conferenceId, the domain conference.
    groq`{
      "routes": *[_type == "conference" && _id == $conferenceId][0].speakerInfo.dinner.routes[]{ _key, label },
      "speakers": *[_type == "talk" && conference._ref == $conferenceId && status == "confirmed" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))].speakers[]->{ _id, name, email },
      "choices": *[_type == "speakerDinnerChoice" && conference._ref == $conferenceId]{ "speakerId": speaker._ref, choice }
    }`,
    { conferenceId },
  )
}
