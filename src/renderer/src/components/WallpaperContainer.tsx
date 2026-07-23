import { type ReactElement, type ReactNode, useEffect } from 'react'
import { resetIgnoreMouseCache, setIgnoreMouseEvents } from '../lib/mouseBridge'

export type WallpaperContainerProps = {
  children: ReactNode
}

/**
 * Full-viewport wallpaper shell with dynamic click-through.
 * Uses forwarded mousemove + elementFromPoint so interactive hotspots
 * (`.interaction-ui`) can reclaim mouse capture reliably.
 */
export function WallpaperContainer({ children }: WallpaperContainerProps): ReactElement {
  useEffect(() => {
    resetIgnoreMouseCache()
    setIgnoreMouseEvents(true, { forwardToOverlay: true })

    const syncMouseCapture = (clientX: number, clientY: number): void => {
      const el = document.elementFromPoint(clientX, clientY)
      const overInteractive = Boolean(el?.closest('.interaction-ui'))
      setIgnoreMouseEvents(!overInteractive, { forwardToOverlay: true })
    }

    const onMouseMove = (event: MouseEvent): void => {
      syncMouseCapture(event.clientX, event.clientY)
    }

    const onWindowMouseLeave = (): void => {
      setIgnoreMouseEvents(true, { forwardToOverlay: true })
    }

    window.addEventListener('mousemove', onMouseMove)
    document.documentElement.addEventListener('mouseleave', onWindowMouseLeave)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      document.documentElement.removeEventListener('mouseleave', onWindowMouseLeave)
    }
  }, [])

  return (
    <div
      className="wallpaper-root fixed inset-0 h-screen w-screen overflow-hidden bg-transparent"
      style={{ width: '100vw', height: '100vh' }}
      onMouseLeave={() => {
        setIgnoreMouseEvents(true, { forwardToOverlay: true })
      }}
    >
      {children}
    </div>
  )
}

export default WallpaperContainer
