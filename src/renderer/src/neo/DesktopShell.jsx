import { useEffect, useState } from 'react'
import { WallpaperContainer } from './WallpaperContainer'

/**
 * Wraps MDC App with Neo click-through shell when desktop-embedded.
 */
export default function DesktopShell({ children }) {
  const [embedded, setEmbedded] = useState(() => Boolean(window.__myCalDesktopEmbedded))

  useEffect(() => {
    const sync = (status) => {
      const next = Boolean(status?.embedded ?? window.__myCalDesktopEmbedded)
      setEmbedded(next)
      document.documentElement.classList.toggle('desktop-embedded', next)
    }

    const onStatus = (event) => sync(event.detail)
    window.addEventListener('mycalendar:widgetStatusChanged', onStatus)

    void window.myCalendar?.getWidgetStatus?.().then(sync).catch(() => sync(null))

    return () => {
      window.removeEventListener('mycalendar:widgetStatusChanged', onStatus)
    }
  }, [])

  return <WallpaperContainer enabled={embedded}>{children}</WallpaperContainer>
}
