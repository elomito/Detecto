import { useCallback, useEffect, useRef, useState } from 'react'
import { LIVE_FPS, WS_DETECT_URL } from '../api/detect'
import { drawDetectionBoxes } from '../utils/bboxLayout'
import './LiveCameraPanel.css'

/**
 * @param {{
 *   active?: boolean
 *   onPersisted?: () => void
 * }} props
 */
export default function LiveCameraPanel({ active = true, onPersisted }) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const captureRef = useRef(null)
  const streamRef = useRef(null)
  const wsRef = useRef(null)
  const intervalRef = useRef(null)
  const runningRef = useRef(false)
  const inFlightRef = useRef(false)
  const frameTimesRef = useRef([])

  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [count, setCount] = useState(0)
  const [fps, setFps] = useState(0)
  const [inferenceMs, setInferenceMs] = useState(null)
  const [status, setStatus] = useState('idle')

  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const stopCamera = useCallback(() => {
    runningRef.current = false
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    const ws = wsRef.current
    wsRef.current = null
    if (ws) {
      try {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'client stop')
        }
      } catch {
        // ignore close errors
      }
    }
    const stream = streamRef.current
    streamRef.current = null
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }
    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }
    clearOverlay()
    setRunning(false)
    setStatus('idle')
    setFps(0)
    frameTimesRef.current = []
    inFlightRef.current = false
  }, [clearOverlay])

  // Tear down when leaving live mode or unmounting.
  useEffect(() => {
    if (!active) {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [active, stopCamera])

  function syncOverlaySize() {
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video || !overlay) return
    const w = video.clientWidth
    const h = video.clientHeight
    if (w > 0 && h > 0 && (overlay.width !== w || overlay.height !== h)) {
      overlay.width = w
      overlay.height = h
    }
  }
