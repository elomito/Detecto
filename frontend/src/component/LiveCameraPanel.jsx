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

  function recordResultFps() {
    const now = performance.now()
    const times = frameTimesRef.current
    times.push(now)
    while (times.length > 0 && now - times[0] > 1000) {
      times.shift()
    }
    setFps(times.length)
  }

  function captureAndSend() {
    const video = videoRef.current
    const capture = captureRef.current
    const ws = wsRef.current
    if (!video || !capture || !ws || ws.readyState !== WebSocket.OPEN) return
    if (inFlightRef.current) return
    if (video.readyState < 2 || video.videoWidth === 0) return

    const maxSide = 640
    const vw = video.videoWidth
    const vh = video.videoHeight
    const scale = Math.min(1, maxSide / Math.max(vw, vh))
    const cw = Math.max(1, Math.round(vw * scale))
    const ch = Math.max(1, Math.round(vh * scale))
    if (capture.width !== cw || capture.height !== ch) {
      capture.width = cw
      capture.height = ch
    }

    const ctx = capture.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(video, 0, 0, cw, ch)

    // Prefer binary JPEG (avoids JSON.stringify dropping undefined `frame`).
    inFlightRef.current = true
    const sendFailed = () => {
      inFlightRef.current = false
    }

    if (typeof capture.toBlob === 'function') {
      capture.toBlob(
        (blob) => {
          if (!blob || blob.size < 32) {
            sendFailed()
            return
          }
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            sendFailed()
            return
          }
          blob
            .arrayBuffer()
            .then((buf) => {
              try {
                wsRef.current.send(buf)
              } catch {
                sendFailed()
              }
            })
            .catch(sendFailed)
        },
        'image/jpeg',
        0.7,
      )
      return
    }

    // Fallback for older browsers: JSON + base64.
    let dataUrl
    try {
      dataUrl = capture.toDataURL('image/jpeg', 0.7)
    } catch {
      sendFailed()
      return
    }
    const base64 = dataUrl.includes(',') ? dataUrl.split(',', 1)[1] : dataUrl
    if (!base64 || base64.length < 32) {
      sendFailed()
      return
    }
    try {
      ws.send(JSON.stringify({ frame: base64 }))
    } catch {
      sendFailed()
    }
  }

  function handleResult(payload) {
    inFlightRef.current = false
    if (payload?.error) {
      setError(String(payload.error))
      return
    }
    const detections = Array.isArray(payload.detections) ? payload.detections : []
    const nextCount = typeof payload.count === 'number' ? payload.count : detections.length
    setCount(nextCount)
    if (typeof payload.inference_time_ms === 'number') {
      setInferenceMs(payload.inference_time_ms)
    }
    recordResultFps()

    const video = videoRef.current
    const overlay = overlayRef.current
    if (video && overlay) {
      syncOverlaySize()
      const ctx = overlay.getContext('2d')
      if (ctx) {
        drawDetectionBoxes(
          ctx,
          overlay,
          detections,
          video.videoWidth,
          video.videoHeight,
        )
      }
    }

    if (payload.persisted && typeof onPersisted === 'function') {
      onPersisted()
    }
  }

  async function startCamera() {
    setError(null)
    setCount(0)
    setInferenceMs(null)
    setFps(0)
    frameTimesRef.current = []

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'Camera access is not available in this browser. Use HTTPS or localhost, or try another browser.',
      )
      return
    }

    setStatus('requesting')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })
    } catch (err) {
      const name = err && typeof err === 'object' ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError(
          'Camera permission denied. Allow camera access for this site, then try Start again.',
        )
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No camera was found. Connect a webcam and try again.')
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('Camera is already in use by another application. Close it and try again.')
      } else {
        const reason = err instanceof Error ? err.message : 'unknown error'
        setError(`Could not open the camera (${reason}).`)
      }
      setStatus('idle')
      return
    }

    streamRef.current = stream
    const video = videoRef.current
    if (!video) {
      for (const track of stream.getTracks()) track.stop()
      streamRef.current = null
      setError('Video element is not ready. Refresh and try again.')
      setStatus('idle')
      return
    }

    video.srcObject = stream
    try {
      await video.play()
    } catch (err) {
      stopCamera()
      const reason = err instanceof Error ? err.message : 'playback failed'
      setError(`Camera stream could not start (${reason}).`)
      return
    }

    setStatus('connecting')
    let ws
    try {
      ws = new WebSocket(WS_DETECT_URL)
    } catch (err) {
      stopCamera()
      const reason = err instanceof Error ? err.message : 'invalid WebSocket URL'
      setError(`Could not open live detection socket (${reason}). Check VITE_WS_URL.`)
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      if (!runningRef.current && wsRef.current !== ws) return
      setStatus('live')
      setRunning(true)
      runningRef.current = true
      const intervalMs = Math.max(50, Math.round(1000 / LIVE_FPS))
      intervalRef.current = window.setInterval(() => {
        if (!runningRef.current) return
        syncOverlaySize()
        captureAndSend()
      }, intervalMs)
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        handleResult(payload)
      } catch {
        setError('Received an invalid detection message from the server.')
      }
    }

    ws.onerror = () => {
      setError(
        `Live detection connection failed (${WS_DETECT_URL}). Check that the backend is running and VITE_WS_URL is correct.`,
      )
      stopCamera()
    }

    ws.onclose = () => {
      if (runningRef.current) {
        stopCamera()
        setError('Live detection connection closed. Press Start to reconnect.')
      }
    }
  }
