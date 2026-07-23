import type { ReactElement } from 'react'
import { SITE_URL } from '../../../shared/constants'
import { openExternalUrl } from '../lib/openExternal'

/** MDC SiteLink — footer URL text style. */
export function SiteLink(): ReactElement {
  return (
    <a
      href={SITE_URL}
      className="site-link text-xs text-gcal-muted transition-colors hover:text-gcal-blue hover:underline"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void openExternalUrl(SITE_URL)
      }}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {SITE_URL}
    </a>
  )
}

export default SiteLink
