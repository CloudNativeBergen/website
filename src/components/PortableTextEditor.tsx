'use client'

import * as selectors from '@portabletext/editor/selectors'
import {
  defineSchema,
  EditorProvider,
  PortableTextBlock,
  PortableTextEditable,
  RenderAnnotationFunction,
  RenderDecoratorFunction,
  RenderListItemFunction,
  RenderStyleFunction,
  useEditor,
  useEditorSelector,
  type Editor,
} from '@portabletext/editor'
import { EventListenerPlugin } from '@portabletext/editor/plugins'
import { HelpText } from './Form'
import { ReactNode, useId, useState } from 'react'
import './PortableTextEditor.css'
import {
  BoldIcon,
  H1Icon,
  H2Icon,
  H3Icon,
  ItalicIcon,
  LinkIcon,
  ListBulletIcon,
  NumberedListIcon,
  UnderlineIcon,
} from '@heroicons/react/20/solid'

const schemaDefinition = defineSchema({
  decorators: [{ name: 'strong' }, { name: 'em' }, { name: 'underline' }],
  styles: [{ name: 'h1' }, { name: 'h2' }, { name: 'h3' }],
  lists: [{ name: 'bullet' }, { name: 'number' }],
  annotations: [
    {
      name: 'link',
      type: 'object',
      fields: [
        {
          name: 'href',
          type: 'string',
        },
      ],
    },
  ],
})

type StyleName = 'h1' | 'h2' | 'h3'
type DecoratorName = 'strong' | 'em' | 'underline'
type ListName = 'bullet' | 'number'

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
            fontFamily:
              '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {children}
        </h3>
      )

    case 'normal': {
      return (
        <div
          style={{
            fontSize: '16px',
            lineHeight: '1.6',
            marginBottom: '16px',
            marginTop: '0',
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

const renderAnnotation: RenderAnnotationFunction = ({
  schemaType,
  children,
  value,
}) => {
  if (schemaType.name === 'link') {
    const href = value?.href as string
    return (
      <a
        href={href}
        className="font-medium text-blue-600 underline dark:text-blue-400"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  }
  return <>{children}</>
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
      className={`focus-visible:ring-ring inline-flex h-9 w-9 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors hover:bg-blue-900 hover:text-white focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ${isActive ? 'bg-blue-800 text-white' : 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white dark:hover:bg-blue-700'}`}
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

function LinkButton() {
  const editor = useEditor() as Editor
  const isSelectionCollapsed = useEditorSelector(
    editor,
    selectors.isSelectionCollapsed,
  )
  const isActive = useEditorSelector(
    editor,
    selectors.isActiveAnnotation('link'),
  )

  const handleLinkClick = () => {
    if (isActive) {
      editor.send({
        type: 'annotation.remove',
        annotation: {
          name: 'link',
        },
      })
      editor.send({ type: 'focus' })
      return
    }

    if (isSelectionCollapsed) {
      alert('Please select some text first before adding a link.')
      return
    }

    const url = prompt('Enter URL:')
    if (url && url.trim()) {
      editor.send({
        type: 'annotation.add',
        annotation: {
          name: 'link',
          value: {
            href: url.trim(),
          },
        },
      })
      editor.send({ type: 'focus' })
    }
  }

  return (
    <ToolbarButton isActive={isActive} onClick={handleLinkClick}>
      <LinkIcon />
    </ToolbarButton>
  )
}

function Toolbar() {
  const styleButtons =
    schemaDefinition.styles?.map(({ name }) => (
      <StyleButton key={name} styleName={name as StyleName} />
    )) || []

  const decoratorButtons =
    schemaDefinition.decorators?.map(({ name }) => (
      <DecoratorButton key={name} decoratorName={name as DecoratorName} />
    )) || []

  const listButtons =
    schemaDefinition.lists?.map(({ name }) => (
      <ListButton key={name} listName={name as ListName} />
    )) || []

  return (
    <div className="my-2 flex gap-1">
      {styleButtons}
      {decoratorButtons}
      <LinkButton />
      {listButtons}
    </div>
  )
}

export function PortableTextEditor({
  label,
  value,
  onChange,
  helpText,
  forceRemountKey,
}: {
  label: ReactNode
  value: PortableTextBlock[] | undefined
  onChange: (value: PortableTextBlock[]) => void
  helpText?: ReactNode
  forceRemountKey?: string | number
}) {
  const id = useId()
  const [isClient] = useState(() => typeof window !== 'undefined')

  const safeValue = value || []

  const editorKey = forceRemountKey
    ? `editor-${id}-${forceRemountKey}`
    : `editor-${id}`

  if (!isClient) {
    return (
      <div>
        <label
          htmlFor={id}
          className="block text-sm/6 font-medium text-gray-900 dark:text-white"
        >
          {label}
        </label>
        <div className="block min-h-60 w-full rounded-md bg-gray-50 p-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Loading editor...
          </div>
        </div>
        {helpText && <HelpText>{helpText}</HelpText>}
      </div>
    )
  }

  return (
    <>
      <EditorProvider
        key={editorKey}
        initialConfig={{
          schemaDefinition,
          initialValue: safeValue,
        }}
      >
        <EventListenerPlugin
          on={(event) => {
            if (event.type === 'mutation') {
              const newValue = event.value ?? []
              onChange(newValue)
            }
          }}
        />

        <label
          htmlFor={id}
          className="block text-sm/6 font-medium text-gray-900 dark:text-white"
        >
          {label}
        </label>

        <Toolbar />

        <PortableTextEditable
          id={id}
          className="block min-h-60 w-full rounded-md bg-white p-3 text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
          style={{
            fontSize: '16px',
            lineHeight: '1.6',
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
          renderStyle={renderStyle}
          renderDecorator={renderDecorator}
          renderAnnotation={renderAnnotation}
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
