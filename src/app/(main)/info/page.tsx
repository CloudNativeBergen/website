import { formatDate } from '@/lib/time'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export default async function Info() {
  const { conference } = await getConferenceForCurrentDomain();

  const faqs = [
    {
      anchor: 'general',
      heading: 'For Attendees',
      description: 'Practical information for attending the conference.',
      questions: [
        {
          question: 'What is the date of the conference?',
          answer: `The conference will be held on ${formatDate(conference.start_date)}. The talks are scheduled to start at 09:00 and to end at 17:00. The doors will be open from 08:00`,
        },
        {
          question: 'Where is the conference located?',
          answer:
            'The conference will take place at the Academic Quarter (Kvarteret) in Bergen, Norway. The address is Olav Kyrres gate 49. You can find more information about Kvarteret on their website at <u><a href="https://kvarteret.no">kvarteret.no</a></u>.',
        },
        {
          question: 'How do I get to the venue?',
          answer:
            'The venue is located in the city center of Bergen, close to Byparken (City Park) where Bybanen and bus routes to the city center terminates. It takes about an hour from Bergen airport Flesland to the city center. If you are arriving by car, there are parking garages nearby such as Klostergarasjen and Bygarasjen, but we reccomend public transportation.\nYou can find more information about how to get to the venue on their website at <u><a href="https://kvarteret.no">kvarteret.no</a></u>.',
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
          question: 'When and where can I pick up my badge?',
          answer:
            'You can pick up your badge at the registration desk at the venue. The registration desk will be open the day before the event and an hour before the first talk starts.',
        },
        {
          question: 'When will the doors open?',
          answer:
            'The doors will open for registration and coffee an hour before the first talk starts. We suggest you arrive early to get your badge and find a good seat.',
        },
        {
          question: 'What is the code of conduct?',
          answer: `We have a code of conduct that all attendees, speakers, and sponsors must follow. You can read the code of conduct on our website at <u><a href="${conference.coc_link}">Code of Conduct</a></u>. If you have any questions or concerns, please contact us.`,
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
          question: 'What do you reccomend me to do during my stay in Bergen?',
          answer:
            'We recommend you to explore the city of Bergen and the surrounding nature. Bergen is known for its beautiful nature, mountains, fjords, and the UNESCO World Heritage Site Bryggen. You can find more information about Bergen on the official tourism website at <u><a href="https://en.visitbergen.com">visitbergen.com</a></u>.',
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
  ];

  return (
    <>
      <div className="bg-white">
        <div className="py-12">
          <div className="mx-auto max-w-4xl px-4 lg:px-6">
            <div className="text-left">
              <h1 className="text-3xl font-bold leading-9 tracking-tight text-gray-900 sm:text-4xl">
                Practical Information
              </h1>
              <p className="mt-4 text-lg leading-7 text-gray-600">
                Here, you&apos;ll find all the essential details you need to
                make the most of your conference experience. From venue
                information to schedules and accessibility, we&apos;ve got you
                covered. If you have any further questions, feel free to reach
                out to us. We&apos;re here to help!
              </p>
              <div className="mt-8">
                <ul className="mt-4 flex space-x-4">
                  {faqs.map((section) => (
                    <li key={section.anchor}>
                      <a
                        href={`#${section.anchor}`}
                        className="text-lg leading-7 text-blue-600 hover:underline"
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
        {faqs.map((section) => (
          <div key={section.anchor} id={section.anchor}>
            <div className="mx-auto max-w-7xl px-6 py-24 sm:pt-32 lg:px-8 lg:py-40">
              <div className="lg:grid lg:grid-cols-12 lg:gap-8">
                <div className="lg:col-span-5">
                  <h2 className="text-2xl font-bold leading-10 tracking-tight text-gray-900">
                    {section.heading}
                  </h2>
                  <p className="mt-4 text-base leading-7 text-gray-600">
                    {section.description}
                  </p>
                </div>
                <div className="mt-10 lg:col-span-7 lg:mt-0">
                  <dl className="space-y-10">
                    {section.questions.map((faq) => (
                      <div key={faq.question}>
                        <dt className="text-base font-semibold leading-7 text-gray-900">
                          {faq.question}
                        </dt>
                        <dd className="mt-2 text-base leading-7 text-gray-600">
                          {faq.answer.split('\n').map((item, key) => (
                            <p
                              key={key}
                              className={classNames(key > 0 ? 'mt-2' : '')}
                              dangerouslySetInnerHTML={{ __html: item }}
                            ></p>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
