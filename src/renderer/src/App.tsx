import type { ReactElement } from 'react'
import { WallpaperContainer } from './components/WallpaperContainer'
import { CalendarGrid } from './components/CalendarGrid'

export default function App(): ReactElement {
  return (
    <WallpaperContainer>
      <CalendarGrid />
    </WallpaperContainer>
  )
}
