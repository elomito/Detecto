import { useEffect, useState } from 'react'
import UploadPanel from '../components/UploadPanel'
import DetectionResultView from '../components/DetectionResultView'
import HistoryExport from '../components/HistoryExport'
import LiveCameraPanel from '../components/LiveCameraPanel'
import { detectPeople, validateImageFile } from '../api/detect'
import './DetectionView.css'

export default function DetectionView() {
  const [mode, setMode] = useState('upload')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handleModeChange(next) {
    if (next === mode) return
    setMode(next)
    setError(null)
  }

  function handleFileChange(next) {
    setError(null)
    setResult(null)
    if (!next) {
      setFile(null)
      return
    }
    const validationError = validateImageFile(next)
    if (validationError) {
      setFile(null)
      setError(validationError)
      return
    }
    setFile(next)
  }

  async function handleSubmit() {
    const validationError = validateImageFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await detectPeople(file)
      setResult(data)
      setHistoryRefreshKey((key) => key + 1)
      if (data?.warning) {
        setError(data.warning)
      }
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : 'Detection failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="detection-view">
      <header className="detection-view__hero">
        <p className="detection-view__brand">Detecto</p>
        <h1>Detection</h1>
        <p className="detection-view__lede">
          Upload a photo or use your webcam for live person detection with confidence scores and
          timing.
        </p>
      </header>

      <div className="detection-view__modes" role="tablist" aria-label="Detection mode">
        <button
          type="button"
          role="tab"
          id="mode-upload"
          aria-selected={mode === 'upload'}
          className={mode === 'upload' ? 'is-active' : undefined}
          onClick={() => handleModeChange('upload')}
        >
          Upload image
        </button>
        <button
          type="button"
          role="tab"
          id="mode-live"
          aria-selected={mode === 'live'}
          className={mode === 'live' ? 'is-active' : undefined}
          onClick={() => handleModeChange('live')}
        >
          Live camera
        </button>
      </div>

      {mode === 'upload' ? (
        <div
          className="detection-view__grid"
          role="tabpanel"
          aria-labelledby="mode-upload"
        >
          <UploadPanel
            file={file}
            error={error}
            disabled={loading}
            onFileChange={handleFileChange}
            onSubmit={handleSubmit}
          />
          <DetectionResultView
            result={result}
            previewUrl={previewUrl}
            loading={loading}
          />
        </div>
      ) : (
        <div
          className="detection-view__live"
          role="tabpanel"
          aria-labelledby="mode-live"
        >
          <LiveCameraPanel
            active={mode === 'live'}
            onPersisted={() => setHistoryRefreshKey((key) => key + 1)}
          />
        </div>
      )}

      <HistoryExport refreshKey={historyRefreshKey} />
    </div>
  )
}

