'use client'

import * as selectors from '@portabletext/editor/selectors'
import {
  defineSchema,
  EditorProvider,
  PortableTextBlock,
  PortableTextEditable,
  RenderDecoratorFunction,
  RenderListItemFunction,
  RenderStyleFunction,
  useEditor,
  useEditorSelector,
  type Editor,
} from '@portabletext/editor'
import { EventListenerPlugin } from '@portabletext/editor/plugins'
import { HelpText } from './Form'
import { ReactNode, useId, useEffect, useState } from 'react'
import './PortableTextEditor.css'
import {
  BoldIcon,
  H1Icon,
  H2Icon,
  H3Icon,
  ItalicIcon,
  ListBulletIcon,
  NumberedListIcon,
  UnderlineIcon,
} from '@heroicons/react/20/solid'

const schemaDefinition = defineSchema({
  decorators: [{ name: 'strong' }, { name: 'em' }, { name: 'underline' }],
  styles: [{ name: 'h1' }, { name: 'h2' }, { name: 'h3' }],
  lists: [{ name: 'bullet' }, { name: 'number' }],
})

type Schema = typeof schemaDefinition

type Style = Schema['styles'][number]
type StyleName = Style[keyof Style]

type Decorator = Schema['decorators'][number]
type DecoratorName = Decorator[keyof Decorator]

type List = Schema['lists'][number]
type ListName = List[keyof List]

const renderStyle: RenderStyleFunction = ({ schemaType, children }) => {
  const style = schemaType.value as StyleName | 'normal'

  switch (style) {
    case 'h1':
      return (
        <h1
          style={{
            fontSize: '28px',
            fontWeight: '700',
            lineHeight: '1.2',
            marginTop: '0',
            marginBottom: '24px',
            color: '#334155',
            fontFamily:
              '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {children}
        </h1>
      )

    case 'h2':
      return (
        <h2
          style={{
            fontSize: '22px',
            fontWeight: '600',
            lineHeight: '1.3',
            marginTop: '0',
            marginBottom: '20px',
            color: '#334155',
            fontFamily:
              '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {children}
        </h2>
      )

    case 'h3':
      return (
        <h3
          style={{
            fontSize: '18px',
            fontWeight: '600',
            lineHeight: '1.4',
            marginTop: '0',
            marginBottom: '16px',
            color: '#334155',
            fontFamily:
              '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {children}
        </h3>
      )

    case 'normal': {
      // Use div instead of p to avoid nesting issues
      return (
        <div
          style={{
            fontSize: '16px',
            lineHeight: '1.6',
            marginBottom: '16px',
            marginTop: '0',
            color: '#334155',
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          {children}
        </div>
      )
    }
  }
}

const renderDecorator: RenderDecoratorFunction = ({ schemaType, children }) => {
  const elementType = schemaType.value as DecoratorName

  switch (elementType) {
    case 'strong':
      return <strong>{children}</strong>
    case 'em':
      return <em>{children}</em>
    case 'underline':
      return <u>{children}</u>
    default:
      return <>{children}</>
  }
}

const renderListItem: RenderListItemFunction = ({ children, schemaType }) => {
  const listType = schemaType.value as ListName
  return (
    <li
      className={`pt-list-item pt-list-item-${listType} pt-list-item-level-1`}
    >
      {children}
    </li>
  )
}

const styleIcons = {
  h1: <H1Icon />,
  h2: <H2Icon />,
  h3: <H3Icon />,
} as const satisfies Record<StyleName, ReactNode>

const decoratorIcons = {
  em: <ItalicIcon />,
  strong: <BoldIcon />,
  underline: <UnderlineIcon />,
} as const satisfies Record<DecoratorName, ReactNode>

const listIcons = {
  bullet: <ListBulletIcon />,
  number: <NumberedListIcon />,
} as const satisfies Record<ListName, ReactNode>

function ToolbarButton({
  onClick,
  children,
  isActive,
}: {
  children: ReactNode
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`focus-visible:ring-ring inline-flex h-9 w-9 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors hover:bg-blue-900 hover:text-white focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ${isActive ? 'bg-blue-800 text-white' : 'bg-gray-100'}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function StyleButton({ styleName }: { styleName: StyleName }) {
  const editor = useEditor() as Editor
  const isActive = useEditorSelector(editor, selectors.isActiveStyle(styleName))

  return (
    <ToolbarButton
      isActive={isActive}
      onClick={() => {
        editor.send({
          type: 'style.toggle',
          style: styleName,
        })
        editor.send({
          type: 'focus',
        })
      }}
    >
      {styleIcons[styleName]}
    </ToolbarButton>
  )
}

function DecoratorButton({ decoratorName }: { decoratorName: DecoratorName }) {
  const editor = useEditor() as Editor
  const isActive = useEditorSelector(
    editor,
    selectors.isActiveDecorator(decoratorName),
  )

  return (
    <ToolbarButton
      isActive={isActive}
      onClick={() => {
        editor.send({
          type: 'decorator.toggle',
          decorator: decoratorName,
        })
        editor.send({
          type: 'focus',
        })
      }}
    >
      {decoratorIcons[decoratorName]}
    </ToolbarButton>
  )
}

function ListButton({ listName }: { listName: ListName }) {
  const editor = useEditor() as Editor
  const isActive = useEditorSelector(
    editor,
    selectors.isActiveListItem(listName),
  )

  return (
    <ToolbarButton
      isActive={isActive}
      onClick={() => {
        editor.send({
          type: 'list item.toggle',
          listItem: listName,
        })
        editor.send({
          type: 'focus',
        })
      }}
    >
      {listIcons[listName]}
    </ToolbarButton>
  )
}

function Toolbar() {
  const styleButtons = schemaDefinition.styles.map(({ name }) => (
    <StyleButton key={name} styleName={name} />
  ))

  const decoratorButtons = schemaDefinition.decorators.map(({ name }) => (
    <DecoratorButton key={name} decoratorName={name} />
  ))
  const listButtons = schemaDefinition.lists.map(({ name }) => (
    <ListButton key={name} listName={name} />
  ))

  return (
    <div className="my-2 flex gap-1">
      {styleButtons}
      {decoratorButtons}
      {listButtons}
    </div>
  )
}

export function PortableTextEditor({
  label,
  value,
  onChange,
  helpText,
}: {
  label: ReactNode
  value: PortableTextBlock[] | undefined
  onChange: (value: PortableTextBlock[]) => void
  helpText?: ReactNode
}) {
  const id = useId()
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    // Show a placeholder during server-side rendering
    return (
      <div>
        <label
          htmlFor={id}
          className="block text-sm/6 font-medium text-gray-900"
        >
          {label}
        </label>
        <div className="block min-h-60 w-full rounded-md bg-gray-50 p-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
          <div className="text-sm text-gray-500">Loading editor...</div>
        </div>
        {helpText && <HelpText>{helpText}</HelpText>}
      </div>
    )
  }

  return (
    <>
      <EditorProvider
        initialConfig={{
          schemaDefinition,
          initialValue: value,
        }}
      >
        <EventListenerPlugin
          on={(event) => {
            if (event.type === 'mutation') {
              onChange(event.value ?? [])
            }
          }}
        />

        <label
          htmlFor={id}
          className="block text-sm/6 font-medium text-gray-900"
        >
          {label}
        </label>

        <Toolbar />

        <PortableTextEditable
          id={id}
          className="block min-h-60 w-full rounded-md bg-white p-3 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
          style={{
            fontSize: '16px',
            lineHeight: '1.6',
            color: '#334155',
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
          renderStyle={renderStyle}
          renderDecorator={renderDecorator}
          renderBlock={({ children }) => {
            return <>{children}</>
          }}
          renderListItem={renderListItem}
        />
      </EditorProvider>

      {helpText && <HelpText>{helpText}</HelpText>}
    </>
  )
}
