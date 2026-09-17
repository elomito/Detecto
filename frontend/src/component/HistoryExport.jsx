import { useCallback, useEffect, useState } from 'react'
import { downloadHistoryCsv, fetchHistory } from '../api/history'
import './HistoryExport.css'

/**
 * @param {{ refreshKey?: number }} props
 */
export default function HistoryExport({ refreshKey = 0 }) {
  const [count, setCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)
  const [exportMessage, setExportMessage] = useState(null)

  const refreshCount = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHistory()
      setCount(typeof data.count === 'number' ? data.count : 0)
    } catch (err) {
      setCount(null)
      setError(err instanceof Error ? err.message : 'Could not load history.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshCount()
  }, [refreshCount, refreshKey])

  async function handleExport() {
    setExporting(true)
    setError(null)
    setExportMessage(null)
    try {
      await downloadHistoryCsv()
      setExportMessage('CSV download started.')
      await refreshCount()
    } catch (err) {
      setExportMessage(null)
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const recordLabel =
    count === null ? '—' : count === 1 ? '1 record' : `${count} records`

  return (
    <section className="history-export" aria-labelledby="history-export-title">
      <div className="history-export__header">
        <h2 id="history-export-title">Detection history</h2>
        <p>Download past runs as CSV for spreadsheets or reporting.</p>
      </div>

      <div className="history-export__meta">
        <span className="history-export__count">
          {loading ? 'Loading history…' : recordLabel}
        </span>
        <button
          type="button"
          className="history-export__button"
          disabled={loading || exporting || count === 0}
          onClick={handleExport}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {count === 0 && !loading && !error ? (
        <p className="history-export__hint">
          Run a detection to populate history, then export it here.
        </p>
      ) : null}

      {error ? (
        <p className="history-export__error" role="alert">
          {error}
        </p>
      ) : null}

      {exportMessage ? (
        <p className="history-export__success" role="status">
          {exportMessage}
        </p>
      ) : null}
    </section>
  )
}
