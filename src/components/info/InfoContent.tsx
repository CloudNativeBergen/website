'use client'

import { Container } from '@/components/Container'
import clsx from 'clsx'

interface FAQ {
  question: string
  answer: string
}

interface FAQSection {
  anchor: string
  heading: string
  description: string
  questions: FAQ[]
}

interface InfoContentProps {
  faqs: FAQSection[]
}

export function InfoContent({ faqs }: InfoContentProps) {
  return (
    <Container>
      <div className="mt-16 sm:mt-20">
        <div className="mb-12 flex flex-wrap gap-4">
          {faqs.map((section) => (
            <a
              key={section.anchor}
              href={`#${section.anchor}`}
              onClick={(e) => {
                e.preventDefault()
                const element = document.getElementById(section.anchor)
                element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="inline-flex items-center rounded-full bg-blue-600/10 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-600/20 dark:bg-blue-400/20 dark:text-blue-400 dark:hover:bg-blue-400/30"
            >
              {section.heading}
            </a>
          ))}
        </div>

        {faqs.map((section) => (
          <div
            key={section.anchor}
            id={section.anchor}
            className="mb-24 scroll-mt-32 last:mb-0"
          >
            <div className="rounded-3xl bg-white p-8 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
              <div className="lg:grid lg:grid-cols-12 lg:gap-8">
                <div className="lg:col-span-5">
                  <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {section.heading}
                  </h2>
                  <p className="mt-4 text-lg leading-7 text-gray-600 dark:text-gray-400">
                    {section.description}
                  </p>
                </div>
                <div className="mt-10 lg:col-span-7 lg:mt-0">
                  <dl className="space-y-8">
                    {section.questions.map((faq) => (
                      <div key={faq.question}>
                        <dt className="text-base leading-7 font-semibold text-gray-900 dark:text-white">
                          {faq.question}
                        </dt>
                        <dd className="mt-2 text-base leading-7 text-gray-600 dark:text-gray-400 [&_a]:text-blue-600 [&_a]:hover:text-blue-700 dark:[&_a]:text-blue-400 dark:[&_a]:hover:text-blue-300">
                          {faq.answer.split('\n').map((item, key) => (
                            <p
                              key={key}
                              className={clsx(key > 0 ? 'mt-2' : '')}
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
    </Container>
  )
}
