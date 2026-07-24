import { useCallback, useRef, useState } from 'react'

export type HistoryEntry = {
  undo: () => void | Promise<void>
  redo: () => void | Promise<void>
}

export type HistoryStack = {
  push: (entry: HistoryEntry) => void
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
  clear: () => void
  canUndo: boolean
  canRedo: boolean
}

/** MDC-compatible undo/redo stack (max 50 entries). */
export function useHistoryStack(maxSize = 50): HistoryStack {
  const pastRef = useRef<HistoryEntry[]>([])
  const futureRef = useRef<HistoryEntry[]>([])
  const applyingRef = useRef(false)
  const [stackState, setStackState] = useState({ canUndo: false, canRedo: false })

  const syncState = useCallback(() => {
    setStackState({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0
    })
  }, [])

  const push = useCallback(
    (entry: HistoryEntry) => {
      if (applyingRef.current) return
      pastRef.current = [...pastRef.current, entry].slice(-maxSize)
      futureRef.current = []
      syncState()
    },
    [maxSize, syncState]
  )

  const undo = useCallback(async () => {
    const entry = pastRef.current.at(-1)
    if (!entry) return false

    pastRef.current = pastRef.current.slice(0, -1)
    applyingRef.current = true
    try {
      await entry.undo()
      futureRef.current = [...futureRef.current, entry]
      syncState()
      return true
    } catch (err) {
      pastRef.current = [...pastRef.current, entry]
      syncState()
      throw err
    } finally {
      applyingRef.current = false
    }
  }, [syncState])

  const redo = useCallback(async () => {
    const entry = futureRef.current.at(-1)
    if (!entry) return false

    futureRef.current = futureRef.current.slice(0, -1)
    applyingRef.current = true
    try {
      await entry.redo()
      pastRef.current = [...pastRef.current, entry]
      syncState()
      return true
    } catch (err) {
      futureRef.current = [...futureRef.current, entry]
      syncState()
      throw err
    } finally {
      applyingRef.current = false
    }
  }, [syncState])

  const clear = useCallback(() => {
    pastRef.current = []
    futureRef.current = []
    syncState()
  }, [syncState])

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: stackState.canUndo,
    canRedo: stackState.canRedo
  }
}
