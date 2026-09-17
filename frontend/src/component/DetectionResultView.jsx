import BoundingBoxOverlay from './BoundingBoxOverlay'
import './DetectionResultView.css'

/**
 * @param {{
 *   result: {
 *     count: number
 *     detections: Array<{ bbox: number[], confidence: number }>
 *     avg_confidence: number
 *     inference_time_ms: number
 *     image_base64?: string
 *   }
 *   previewUrl?: string | null
 *   loading?: boolean
 * }} props
 */
export default function DetectionResultView({
  result,
  previewUrl = null,
  loading = false,
}) {
  if (loading) {
    return (
      <section className="detection-result is-loading" aria-busy="true">
        <div className="detection-result__spinner" aria-hidden="true" />
        <h2>Running detection</h2>
        <p>Uploading image and waiting for the model…</p>
      </section>
    )
  }

  if (!result) {
    return (
      <section className="detection-result is-empty">
        <h2>Results</h2>
        <p>Upload an image and run detection to see people, confidence, and timing here.</p>
      </section>
    )
  }

  const annotatedSrc = result.image_base64
    ? `data:image/jpeg;base64,${result.image_base64}`
    : null
  // Prefer client preview + live overlay; fall back to server-annotated image.
  const imageSrc = previewUrl || annotatedSrc
  const useClientOverlay = Boolean(previewUrl)

  return (
    <section className="detection-result" aria-live="polite">
      <div className="detection-result__header">
        <h2>Detection result</h2>
        <p>
          {result.count} {result.count === 1 ? 'person' : 'people'} found
        </p>
      </div>

      <div className="detection-result__metrics">
        <div className="metric">
          <span className="metric__label">Count</span>
          <span className="metric__value">{result.count}</span>
        </div>
        <div className="metric">
          <span className="metric__label">Avg confidence</span>
          <span className="metric__value">
            {(Number(result.avg_confidence) * 100).toFixed(1)}%
          </span>
        </div>
        <div className="metric">
          <span className="metric__label">Processing time</span>
          <span className="metric__value">
            {Number(result.inference_time_ms).toFixed(0)} ms
          </span>
        </div>
      </div>

      {imageSrc ? (
        <div className="detection-result__frame">
          {useClientOverlay ? (
            <BoundingBoxOverlay
              imageSrc={imageSrc}
              detections={result.detections}
              alt={`Detected ${result.count} people`}
            />
          ) : (
            <img
              className="detection-result__annotated"
              src={annotatedSrc}
              alt={`Annotated detection with ${result.count} people`}
            />
          )}
        </div>
      ) : null}

      <div className="detection-result__list">
        <h3>Per-person confidence</h3>
        {result.detections.length === 0 ? (
          <p className="detection-result__none">No people detected in this image.</p>
        ) : (
          <ol>
            {result.detections.map((det, index) => (
              <li key={`${index}-${det.confidence}`}>
                <span>Person {index + 1}</span>
                <span className="detection-result__conf">
                  {(Number(det.confidence) * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
