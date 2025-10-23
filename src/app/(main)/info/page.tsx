import { formatDate } from '@/lib/time'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { InfoContent } from '@/components/info/InfoContent'
import type { ConferenceSchedule } from '@/lib/conference/types'

function getScheduleDayInfo(schedules: ConferenceSchedule[] | undefined) {
  if (!schedules || schedules.length === 0) {
    return {
      hasMultipleDays: false,
      workshopDay: null,
      conferenceDay: null,
      days: [],
    }
  }

  const sortedSchedules = [...schedules].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  const hasMultipleDays = sortedSchedules.length > 1

  const days = sortedSchedules.map((schedule) => {
    const allTalks = schedule.tracks.flatMap((track) => track.talks)

    // First item is registration
    const registrationTalk = allTalks.length > 0 ? allTalks[0] : null
    const registrationTime = registrationTalk?.startTime || '08:00'

    // The first talk/workshop starts when registration ends (one hour after it starts)
    // This is the END time of the registration item
    const firstProgramTime = registrationTalk?.endTime || '09:00'

    const endTimes = allTalks.map((talk) => talk.endTime).filter(Boolean)
    const latestEnd = endTimes.length > 0 ? endTimes.sort().reverse()[0] : '17:00'

    const isWorkshopDay = schedule.tracks.some((track) =>
      track.trackTitle?.toLowerCase().includes('workshop'),
    )

    return {
      date: schedule.date,
      registrationTime,
      startTime: firstProgramTime,
      endTime: latestEnd,
      isWorkshopDay,
      schedule,
    }
  })

  return {
    hasMultipleDays,
    workshopDay: days[0], // First day is always workshop day
    conferenceDay: days[1] || days[0], // Second day is conference day, or first if only one day
    days,
  }
}

export default async function Info() {
  const { conference } = await getConferenceForCurrentDomain({ schedule: true })

  if (!conference) {
    return null
  }

  const scheduleInfo = getScheduleDayInfo(conference.schedules)

  const dateAnswer = (() => {
    if (
      scheduleInfo.hasMultipleDays &&
      scheduleInfo.workshopDay &&
      scheduleInfo.conferenceDay
    ) {
      return `This is a multi-day event running from ${formatDate(conference.start_date)} to ${formatDate(conference.end_date)}.

Day 1 (${formatDate(scheduleInfo.workshopDay.date)}) - Workshop Day: Registration opens at ${scheduleInfo.workshopDay.registrationTime}. Workshops run from ${scheduleInfo.workshopDay.startTime} to ${scheduleInfo.workshopDay.endTime}.

Day 2 (${formatDate(scheduleInfo.conferenceDay.date)}) - Main Conference: Registration opens at ${scheduleInfo.conferenceDay.registrationTime}. Talks are scheduled from ${scheduleInfo.conferenceDay.startTime} to ${scheduleInfo.conferenceDay.endTime}.

Important: Please check your ticket type. Workshop tickets (&quot;Workshop + Conference&quot;) grant access to both days, while conference-only tickets grant access to the main conference day only.`
    }

    return `The conference will be held on ${formatDate(conference.start_date)}. Registration opens at ${scheduleInfo.conferenceDay?.registrationTime || '08:00'}. The talks are scheduled to start at ${scheduleInfo.conferenceDay?.startTime || '09:00'} and to end at ${scheduleInfo.conferenceDay?.endTime || '17:00'}.`
  })()

  const faqs = [
    {
      anchor: 'general',
      heading: 'For Attendees',
      description: 'Practical information for attending the conference.',
      questions: [
        {
          question: 'What is the date of the conference?',
          answer: dateAnswer,
        },
        {
          question: 'Where is the conference located?',
          answer: `The conference will take place at ${conference.venue_name || 'the venue'} in ${conference.city}, ${conference.country}.${conference.venue_address ? ` The address is ${conference.venue_address}.` : ''}`,
        },
        {
          question: 'How do I get to the venue?',
          answer: `The venue is located in the city center of ${conference.city}, close to Byparken (City Park) where Bybanen and bus routes to the city center terminates. It takes about an hour from ${conference.city} airport Flesland to the city center. If you are arriving by car, there are parking garages nearby such as Klostergarasjen and Bygarasjen, but we reccomend public transportation.`,
        },
        {
          question: 'Is this venue accessible?',
          answer:
            'Yes, the venue is accessible. If you have any special needs, please let us know in advance as a part of the ticket registration, and we will do our best to accommodate you.',
        },
        {
          question: 'What about allergies and dietary restrictions?',
          answer:
            'We will serve food and drinks during the conference. If you have any allergies or dietary restrictions, please let us know in advance as a part of the ticket registration, and we will do our best to accommodate you.',
        },
        {
          question: 'What ticket types are available?',
          answer: scheduleInfo.hasMultipleDays
            ? 'There are two main ticket types: Workshop + Conference (2 days) tickets provide access to both the workshop day and the main conference day, while Conference Only tickets grant access to the main conference day only. Please verify your ticket type before attending to ensure you have access to the correct days.'
            : 'Please check your ticket confirmation for details about what your ticket includes, such as access to talks, workshops, food, and the afterparty.',
        },
        {
          question: 'When and where can I pick up my badge?',
          answer: scheduleInfo.hasMultipleDays && scheduleInfo.workshopDay && scheduleInfo.conferenceDay
            ? `You can pick up your badge at the registration desk at the venue. Registration opens at ${scheduleInfo.workshopDay.registrationTime} on ${formatDate(scheduleInfo.workshopDay.date)} (workshop day) and at ${scheduleInfo.conferenceDay.registrationTime} on ${formatDate(scheduleInfo.conferenceDay.date)} (conference day). If you&apos;re attending both days, we recommend picking up your badge on the first day.`
            : `You can pick up your badge at the registration desk at the venue. Registration opens at ${scheduleInfo.conferenceDay?.registrationTime || '08:00'}. We recommend arriving early to get your badge and find a good seat.`,
        },
        {
          question: 'When will the doors open?',
          answer: scheduleInfo.hasMultipleDays
            ? `Doors open for registration at ${scheduleInfo.workshopDay?.registrationTime || '08:00'} on the workshop day and at ${scheduleInfo.conferenceDay?.registrationTime || '08:00'} on the conference day. The first workshop starts at ${scheduleInfo.workshopDay?.startTime || '09:00'} and the first talk starts at ${scheduleInfo.conferenceDay?.startTime || '09:00'}. We suggest arriving at registration time to pick up your badge, enjoy coffee, and find a good seat.`
            : `Doors open for registration at ${scheduleInfo.conferenceDay?.registrationTime || '08:00'}. The first talk starts at ${scheduleInfo.conferenceDay?.startTime || '09:00'}. We suggest arriving early to pick up your badge and find a good seat.`,
        },
        {
          question: 'What is the code of conduct?',
          answer: `We have a code of conduct that all attendees, speakers, and sponsors must follow. You can read the code of conduct on our website at <u><a href="/conduct">Code of Conduct</a></u>. If you have any questions or concerns, please contact us.`,
        },
        {
          question: 'What happens after the conference?',
          answer:
            'After the conference, we will host an afterparty at the same venue. The afterparty will start at 6 PM and last until late 🌃 There will be food, drinks, and more opertunities to network with other attendees, speakers and sponsors. The afterparty is included in the conference ticket.',
        },
      ],
    },
    {
      anchor: 'speakers',
      heading: 'For Speakers',
      description:
        'Information for our awesome speakers to make their experience as smooth as possible. If you have any other questions do not hesitate to contact us.',
      questions: [
        {
          question: 'What do I need to do before the conference?',
          answer:
            'You need to confirm your talk and register your ticket before the conference. You can do this by going to the <u><a href="/cfp/list">speaker dashboard</a></u> to confirm your talk, and clicking the link in the email you received to register your complimentary speaker ticket.',
        },
        {
          question: 'Will there be a speaker dinner?',
          answer:
            'Yes! We will host a complimentary speaker dinner for all the speakers and organziers on the evening before the conference at 5 PM. The dinner will be held at a restaurant on the highest mountain in Bergen, Ulriken, with a stunning view of the city.\n We will organize a joint transportation to the lower cable car station for everyone interested, or if you prefer, to hike up together with some of the organizers 🥾 \nYou can find more information about Ulriken on their website at <u><a href="https://ulriken643.no/en/">ulriken643.no</a></u>.',
        },
        {
          question: 'Can I make changes to my talk?',
          answer:
            'Yes, you can make changes to your talk up until the day before the conference. You can edit your talk directly from our website by going to the <u><a href="/cfp/list">speaker dashboard</a></u>.',
        },
        {
          question: 'Do I need to bring my own laptop?',
          answer:
            'Yes, we recommend you to bring your own laptop. We will provide a projector and a screen for your presentation. If you have any special needs, please let us know in advance.',
        },
        {
          question: `What do you reccomend me to do during my stay in ${conference.city}?`,
          answer: `We recommend you to explore the city of ${conference.city} and the surrounding nature. ${conference.city} is known for its beautiful nature, mountains, fjords, and the UNESCO World Heritage Site Bryggen. You can find more information about ${conference.city} on the official tourism website at <u><a href="https://en.visitbergen.com">visitbergen.com</a></u>.`,
        },
      ],
    },
    {
      anchor: 'sponsors',
      heading: 'For Sponsors',
      description:
        'Information for our amazing sponsors that makes this event happening. If you have any questions, please contact us.',
      questions: [
        {
          question: 'How do I obtain the sponsor tickets?',
          answer: `Sponsors will receive a unique link to <u>checkin.no</u> to redeem their complimentary tickets prior to the conference. The email will be sent to the contact person listed in the sponsor agreement and can register all the tickets at once.\nThe email will be sent from <u>no-reply@messenger.checkin.no</u>. If you have not received your link, please check your spam folder or <u><a href="mailto:${conference.contact_email}">contact us</a></u>.`,
        },
        {
          question: 'What should I do with the sponsor rollups?',
          answer: `You can bring your rollups to the venue on the day of the conference, or the day before. We will have a designated area for sponsor rollups. If you have any questions, please <u><a href="mailto:${conference.contact_email}">contact us</a></u>.`,
        },
        {
          question: 'Where can I place my sponsor materials?',
          answer: `We will have a designated area for sponsor rollups and a table for sponsor materials. We do not have space for sponsor booths. If you have any questions, please <u><a href="mailto:${conference.contact_email}">contact us</a></u>.`,
        },
        {
          question: 'Do you provide a list of attendees?',
          answer: `No, we do not provide a list of attendees. However, we encourage you to network with the attendees during the conference and afterparty.`,
        },
      ],
    },
  ]

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-xl lg:max-w-4xl lg:px-12">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
              Practical Information
            </h1>
            <div className="font-display mt-6 space-y-6 text-2xl tracking-tight text-blue-900 dark:text-blue-300">
              <p>
                Here, you&apos;ll find all the essential details you need to
                make the most of your conference experience. From venue
                information to schedules and accessibility, we&apos;ve got you
                covered.
              </p>
              <p>
                If you have any further questions, feel free to reach out to us.
                We&apos;re here to help!
              </p>
            </div>
          </div>
        </Container>
      </div>

      <InfoContent faqs={faqs} />
    </>
  )
}
