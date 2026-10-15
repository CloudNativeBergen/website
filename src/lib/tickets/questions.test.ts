import { describe, it, expect } from 'vitest'
import {
  cleanQuestionLabel,
  splitQuestionAndOption,
  normalizeChoiceValue,
  discoverTicketQuestions,
  resolveSpeakerAnswer,
  resolveSpeakerAnswers,
} from './questions'

describe('ticket questions discovery & normalization', () => {
  it('cleans labels correctly', () => {
    expect(cleanQuestionLabel('Will you attend the Monday workshops?')).toBe(
      'Monday workshops',
    )
    expect(cleanQuestionLabel('Will you attend the speaker dinner?')).toBe(
      'Speaker dinner',
    )
    expect(cleanQuestionLabel('work_title')).toBe('Work Title')
    expect(cleanQuestionLabel('company')).toBe('Company')
  })

  it('splits question prompt and option text', () => {
    expect(
      splitQuestionAndOption(
        'Will you attend the speaker dinner? - Yes, I will attend',
      ),
    ).toEqual({
      questionPrompt: 'Will you attend the speaker dinner?',
      optionText: 'Yes, I will attend',
    })

    expect(splitQuestionAndOption('Consent to Media Publication')).toEqual({
      questionPrompt: 'Consent to Media Publication',
    })

    expect(
      splitQuestionAndOption('Pre-conference - Monday workshops - Yes'),
    ).toEqual({
      questionPrompt: 'Pre-conference - Monday workshops',
      optionText: 'Yes',
    })
  })

  it('normalizes choice values', () => {
    expect(normalizeChoiceValue('Yes, I will attend', '1')).toBe('Yes')
    expect(normalizeChoiceValue('No', '1')).toBe('No')
    expect(normalizeChoiceValue('Yes', '0')).toBeNull()
    expect(normalizeChoiceValue(undefined, '1')).toBe('Yes')
    expect(normalizeChoiceValue(undefined, '0')).toBe('No')
    expect(normalizeChoiceValue(undefined, 'Senior Engineer')).toBe(
      'Senior Engineer',
    )
  })

  it('dynamically discovers questions across ticket additionals and fields', () => {
    const sampleTickets = [
      {
        fields: [
          { key: 'work_title', value: 'Senior Cloudy Developer Advocate' },
          { key: 'company', value: 'Google Cloud' },
        ],
        additionals: [
          { name: 'Consent to Media Publication', value: '1' },
          {
            name: 'Will you attend the speaker dinner? - Yes, I will attend',
            value: '1',
          },
          {
            name: 'Will you attend the conference party? - Yes, I will attend',
            value: '1',
          },
          {
            name: 'Will you attend the Monday workshops? - Yes',
            value: '1',
          },
        ],
      },
      {
        fields: [{ key: 'company', value: 'Dynatrace' }],
        additionals: [
          {
            name: 'Will you attend the Monday workshops? - No',
            value: '1',
          },
        ],
      },
    ]

    const questions = discoverTicketQuestions(sampleTickets)
    expect(questions.map((q) => q.label)).toEqual(
      expect.arrayContaining([
        'Monday workshops',
        'Speaker dinner',
        'Conference party',
        'Work Title',
        'Company',
        'Consent to Media Publication',
      ]),
    )

    const workshopQ = questions.find((q) => q.label === 'Monday workshops')!
    expect(workshopQ.type).toBe('choice')
    expect(workshopQ.options).toContain('Yes')
    expect(workshopQ.options).toContain('No')
  })

  it('upgrades a question from text to choice when an earlier ticket had an empty value', () => {
    const questions = discoverTicketQuestions([
      {
        additionals: [{ name: 'Dietary restrictions', value: '' }],
      },
      {
        additionals: [
          { name: 'Dietary restrictions - Vegan', value: '1' },
          { name: 'Dietary restrictions - Gluten-free', value: '0' },
        ],
      },
    ])

    expect(questions).toHaveLength(1)
    expect(questions[0].type).toBe('choice')
    expect(questions[0].options).toEqual(['Vegan', 'Gluten-free'])
  })

  it('preserves distinct prompt keys and does not collide on punctuation or non-ASCII', () => {
    const questions = discoverTicketQuestions([
      {
        additionals: [
          { name: 'Diet? - Vegan', value: '1' },
          { name: 'Diet! - Halal', value: '1' },
          { name: 'Ønsker middag? - Ja', value: '1' },
        ],
      },
    ])
    expect(questions).toHaveLength(3)
    const ids = questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('resolves speaker answers accurately including multi-select and comma-containing choices', () => {
    const speaker1 = {
      additionals: [
        {
          name: 'Will you attend the Monday workshops? - Yes',
          value: '1',
        },
        {
          name: 'Will you attend the speaker dinner? - Yes, I will attend',
          value: '1',
        },
        {
          name: 'Dietary restrictions - Vegan',
          value: '1',
        },
        {
          name: 'Dietary restrictions - Gluten-free, dairy-free',
          value: '1',
        },
      ],
      fields: [{ key: 'company', value: 'Google Cloud' }],
    }

    const speaker2 = {
      additionals: [
        {
          name: 'Will you attend the Monday workshops? - No',
          value: '1',
        },
      ],
    }

    const questions = discoverTicketQuestions([speaker1, speaker2])
    const workshopQ = questions.find((q) => q.label === 'Monday workshops')!
    const dinnerQ = questions.find((q) => q.label === 'Speaker dinner')!
    const dietQ = questions.find((q) => q.label === 'Dietary restrictions')!
    const companyQ = questions.find((q) => q.label === 'Company')!

    expect(resolveSpeakerAnswer(speaker1, workshopQ)).toBe('Yes')
    expect(resolveSpeakerAnswer(speaker2, workshopQ)).toBe('No')
    expect(resolveSpeakerAnswer(speaker1, dinnerQ)).toBe('Yes')
    expect(resolveSpeakerAnswer(speaker2, dinnerQ)).toBeNull()
    expect(resolveSpeakerAnswers(speaker1, dietQ)).toEqual([
      'Vegan',
      'Gluten-free, dairy-free',
    ])
    expect(resolveSpeakerAnswer(speaker1, dietQ)).toBe(
      'Vegan, Gluten-free, dairy-free',
    )
    expect(resolveSpeakerAnswer(speaker1, companyQ)).toBe('Google Cloud')
  })

  it('normalizes Norwegian Ja/Nei boolean values and deduplicates case-insensitive field keys', () => {
    expect(normalizeChoiceValue(undefined, 'Ja')).toBe('Yes')
    expect(normalizeChoiceValue(undefined, 'nei')).toBe('No')
    expect(normalizeChoiceValue('Ja, jeg kommer', 'ja')).toBe('Yes')
    expect(normalizeChoiceValue('Nei, dessverre', 'ja')).toBe('No')
    expect(normalizeChoiceValue('Ja, jeg kommer', 'nei')).toBeNull()

    const tickets = [
      { fields: [{ key: 'Company', value: 'Acme' }] },
      { fields: [{ key: 'company', value: 'Globex' }] },
    ]
    const questions = discoverTicketQuestions(tickets)
    expect(questions).toHaveLength(1)
    expect(questions[0].id).toBe('field:company')
    expect(resolveSpeakerAnswer(tickets[0], questions[0])).toBe('Acme')
    expect(resolveSpeakerAnswer(tickets[1], questions[0])).toBe('Globex')
  })
})
