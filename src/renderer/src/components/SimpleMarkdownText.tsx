import type { CSSProperties, ReactElement } from 'react'
import { parseSimpleMarkdown } from '../../../shared/simpleMarkdown.js'
import { splitLinkifySegments } from '../lib/linkify'
import { openExternalUrl } from '../lib/openExternal'
import { cn } from '../lib/cn'

export type SimpleMarkdownTextProps = {
  text: string
  className?: string
  /** When false, skip bare-URL detection inside plain runs. Default true. */
  linkify?: boolean
  style?: CSSProperties
}

function runClass(run: {
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
}): string {
  return cn(
    run.bold && 'font-semibold text-gcal-heading',
    run.italic && 'italic',
    run.strike && 'line-through text-gcal-muted',
    run.code &&
      'rounded bg-gcal-surface-2 px-0.5 font-mono text-[0.92em] text-gcal-heading'
  )
}

function MarkdownAnchor({
  href,
  children,
  className
}: {
  href: string
  children: React.ReactNode
  className?: string
}): ReactElement {
  return (
    <a
      href={href}
      className={cn('text-gcal-blue hover:underline', className)}
      title={href}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void openExternalUrl(href)
      }}
    >
      {children}
    </a>
  )
}

/** Render **bold** *italic* ~~strike~~ `code` [label](url) (+ optional bare URL linkify). */
export function SimpleMarkdownText({
  text,
  className,
  linkify = true,
  style
}: SimpleMarkdownTextProps): ReactElement {
  const runs = parseSimpleMarkdown(text)
  return (
    <span className={className} style={style}>
      {runs.map((run, index) => {
        const cls = runClass(run)
        if (run.href) {
          return (
            <MarkdownAnchor key={index} href={run.href} className={cls || undefined}>
              {run.text}
            </MarkdownAnchor>
          )
        }
        if (run.code || !linkify) {
          return (
            <span key={index} className={cls || undefined}>
              {run.text}
            </span>
          )
        }
        const segments = splitLinkifySegments(run.text)
        return (
          <span key={index} className={cls || undefined}>
            {segments.map((segment, segIndex) =>
              segment.url ? (
                <MarkdownAnchor key={segIndex} href={segment.url}>
                  {segment.text}
                </MarkdownAnchor>
              ) : (
                <span key={segIndex}>{segment.text}</span>
              )
            )}
          </span>
        )
      })}
    </span>
  )
}

export default SimpleMarkdownText
