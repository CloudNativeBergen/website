import { describe, it, expect } from 'vitest'
import {
  cleanQuestionLabel,
  splitQuestionAndOption,
  normalizeChoiceValue,
  discoverTicketQuestions,
  resolveSpeakerAnswer,
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

  it('resolves speaker answers accurately', () => {
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
    const companyQ = questions.find((q) => q.label === 'Company')!

    expect(resolveSpeakerAnswer(speaker1, workshopQ)).toBe('Yes')
    expect(resolveSpeakerAnswer(speaker2, workshopQ)).toBe('No')
    expect(resolveSpeakerAnswer(speaker1, dinnerQ)).toBe('Yes')
    expect(resolveSpeakerAnswer(speaker2, dinnerQ)).toBeNull()
    expect(resolveSpeakerAnswer(speaker1, companyQ)).toBe('Google Cloud')
  })
})
