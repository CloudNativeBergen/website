import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { useState } from 'react'
import {
  Input,
  LinkInput,
  ErrorText,
  HelpText,
  Textarea,
  Dropdown,
  Checkbox,
  Multiselect,
} from './Form'

const meta = {
  title: 'Components/Forms/Form Elements',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md space-y-6 p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// --- Input ---

export const InputDefault: Story = {
  name: 'Input',
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState('John Doe')
      return (
        <Input
          name="name"
          label="Full Name"
          value={value}
          setValue={setValue}
        />
      )
    }
    return <Wrapper />
  },
}

export const InputEmpty: Story = {
  name: 'Input (Empty)',
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState('')
      return (
        <Input
          name="email"
          label="Email Address"
          value={value}
          setValue={setValue}
          type="email"
        />
      )
    }
    return <Wrapper />
  },
}

export const InputReadOnly: Story = {
  name: 'Input (Read Only)',
  render: () => <Input name="id" label="Speaker ID" value="spk_abc123" />,
}

// --- Textarea ---

export const TextareaDefault: Story = {
  name: 'Textarea',
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState(
        'A talk about building resilient microservices with Kubernetes.',
      )
      return (
        <Textarea
          name="description"
          label="Talk Description"
          value={value}
          setValue={setValue}
          rows={4}
        />
      )
    }
    return <Wrapper />
  },
}

// --- Dropdown ---

export const DropdownDefault: Story = {
  name: 'Dropdown',
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState('30')
      const options = new Map([
        ['15', '15 minutes (Lightning Talk)'],
        ['30', '30 minutes'],
        ['45', '45 minutes'],
        ['60', '60 minutes (Workshop)'],
      ])
      return (
        <Dropdown
          name="duration"
          label="Talk Duration"
          options={options}
          value={value}
          setValue={setValue}
        />
      )
    }
    return <Wrapper />
  },
}

export const DropdownNoSelection: Story = {
  name: 'Dropdown (No Selection)',
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState('')
      const options = new Map([
        ['beginner', 'Beginner'],
        ['intermediate', 'Intermediate'],
        ['advanced', 'Advanced'],
      ])
      return (
        <Dropdown
          name="level"
          label="Experience Level"
          options={options}
          value={value}
          setValue={setValue}
          placeholder="Choose a level..."
        />
      )
    }
    return <Wrapper />
  },
}

// --- Checkbox ---

export const CheckboxDefault: Story = {
  name: 'Checkbox',
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState(false)
      return (
        <Checkbox
          name="terms"
          label="I agree to the terms and conditions"
          value={value}
          setValue={setValue}
        >
          <HelpText>You must accept the terms before submitting.</HelpText>
        </Checkbox>
      )
    }
    return <Wrapper />
  },
}

export const CheckboxChecked: Story = {
  name: 'Checkbox (Checked)',
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState(true)
      return (
        <Checkbox
          name="newsletter"
          label="Subscribe to newsletter"
          value={value}
          setValue={setValue}
        />
      )
    }
    return <Wrapper />
  },
}

// --- Multiselect ---

export const MultiselectDefault: Story = {
  name: 'Multiselect',
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState<string[]>(['kubernetes'])
      const options = [
        { id: 'kubernetes', title: 'Kubernetes', color: '326CE5' },
        { id: 'observability', title: 'Observability', color: 'E6522C' },
        { id: 'security', title: 'Security', color: '00B39F' },
        { id: 'serverless', title: 'Serverless', color: 'FF9900' },
        { id: 'networking', title: 'Networking', color: '7B42BC' },
      ]
      return (
        <Multiselect
          name="topics"
          label="Topics"
          options={options}
          value={value}
          setValue={setValue}
          maxItems={3}
          placeholder="Add a topic..."
        />
      )
    }
    return <Wrapper />
  },
}

export const MultiselectMaxReached: Story = {
  name: 'Multiselect (Max Reached)',
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState<string[]>(['kubernetes', 'security'])
      const options = [
        { id: 'kubernetes', title: 'Kubernetes', color: '326CE5' },
        { id: 'security', title: 'Security', color: '00B39F' },
        { id: 'serverless', title: 'Serverless', color: 'FF9900' },
      ]
      return (
        <Multiselect
          name="topics"
          label="Topics (Max 2)"
          options={options}
          value={value}
          setValue={setValue}
          maxItems={2}
        />
      )
    }
    return <Wrapper />
  },
}

// --- LinkInput ---

export const LinkInputDefault: Story = {
  name: 'LinkInput',
  render: () => {
    const update = fn()
    const add = fn()
    const remove = fn()
    return (
      <div>
        <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
          Social Links
        </label>
        <LinkInput
          index={0}
          name="link-0"
          value="https://github.com/johndoe"
          update={update}
          add={add}
          remove={remove}
        />
        <LinkInput
          index={1}
          name="link-1"
          value="https://linkedin.com/in/johndoe"
          update={update}
          add={add}
          remove={remove}
        />
      </div>
    )
  },
}

// --- ErrorText & HelpText ---

export const TextHelpers: Story = {
  name: 'ErrorText & HelpText',
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          HelpText
        </p>
        <HelpText>
          This field is optional and will be displayed on your speaker profile.
        </HelpText>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          ErrorText
        </p>
        <ErrorText>
          This field is required. Please enter a valid email address.
        </ErrorText>
      </div>
    </div>
  ),
}

// --- Kitchen Sink ---

export const FormExample: Story = {
  render: () => {
    const Wrapper = () => {
      const [name, setName] = useState('Jane Smith')
      const [bio, setBio] = useState('')
      const [level, setLevel] = useState('')
      const [topics, setTopics] = useState<string[]>([])
      const [agreed, setAgreed] = useState(false)

      const levelOptions = new Map([
        ['beginner', 'Beginner'],
        ['intermediate', 'Intermediate'],
        ['advanced', 'Advanced'],
      ])

      const topicOptions = [
        { id: 'kubernetes', title: 'Kubernetes', color: '326CE5' },
        { id: 'observability', title: 'Observability', color: 'E6522C' },
        { id: 'security', title: 'Security', color: '00B39F' },
      ]

      return (
        <div className="space-y-6">
          <Input
            name="speaker-name"
            label="Speaker Name"
            value={name}
            setValue={setName}
          />
          <Textarea
            name="speaker-bio"
            label="Bio"
            value={bio}
            setValue={setBio}
            rows={3}
          />
          <HelpText>
            Brief description of your background and expertise.
          </HelpText>
          <Dropdown
            name="speaker-level"
            label="Experience Level"
            options={levelOptions}
            value={level}
            setValue={setLevel}
            placeholder="Select level..."
          />
          <Multiselect
            name="speaker-topics"
            label="Topics"
            options={topicOptions}
            value={topics}
            setValue={setTopics}
            maxItems={2}
          />
          <Checkbox
            name="speaker-terms"
            label="I accept the speaker agreement"
            value={agreed}
            setValue={setAgreed}
          >
            <HelpText>Required before your talk can be scheduled.</HelpText>
          </Checkbox>
          {!agreed && (
            <ErrorText>You must accept the speaker agreement.</ErrorText>
          )}
        </div>
      )
    }
    return <Wrapper />
  },
}
