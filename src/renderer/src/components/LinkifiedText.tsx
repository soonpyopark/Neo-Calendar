import type { ReactElement } from 'react'
import { splitLinkifySegments } from '../lib/linkify'
import { openExternalUrl } from '../lib/openExternal'

export type LinkifiedTextProps = {
  text: string
}

/** Render free text with clickable URLs (opens in the OS browser). */
export function LinkifiedText({ text }: LinkifiedTextProps): ReactElement {
  const segments = splitLinkifySegments(text)
  return (
    <>
      {segments.map((segment, index) =>
        segment.url ? (
          <a
            key={index}
            href={segment.url}
            className="text-gcal-blue hover:underline"
            title={segment.url}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void openExternalUrl(segment.url as string)
            }}
          >
            {segment.text}
          </a>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  )
}

export default LinkifiedText
