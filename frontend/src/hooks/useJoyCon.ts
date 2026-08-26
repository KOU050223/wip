import { useCallback, useEffect, useRef, useState } from 'react'
import { JoyCon, requestJoyCon, type JoyConState } from '../lib/joycon/joyConDevice'

export interface UseJoyConResult {
  isSupported: boolean
  isConnected: boolean
  state: JoyConState | null
  error: string | null
  connect: () => Promise<void>
}

export function useJoyCon(): UseJoyConResult {
  const [state, setState] = useState<JoyConState | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const joyConRef = useRef<JoyCon | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const isSupported = typeof navigator !== 'undefined' && 'hid' in navigator

  const connect = useCallback(async () => {
    setError(null)
    try {
      const joyCon = await requestJoyCon()
      joyConRef.current = joyCon
      unsubscribeRef.current = joyCon.onState(setState)
      setIsConnected(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.()
      void joyConRef.current?.close()
    }
  }, [])

  return { isSupported, isConnected, state, error, connect }
}
