/**
 * Shared bbox layout for upload overlay and live canvas.
 * Bboxes are [x1, y1, x2, y2] in natural image / video coordinates.
 *
 * @param {Array<{ bbox: number[], confidence: number }>} detections
 * @param {number} naturalW
 * @param {number} naturalH
 * @returns {Array<{ left: number, top: number, width: number, height: number, confidence: number, index: number }>}
 */
export function layoutDetectionBoxes(detections, naturalW, naturalH) {
  if (!naturalW || !naturalH || !Array.isArray(detections)) return []

  return detections.map((det, index) => {
    const [x1, y1, x2, y2] = det.bbox
    return {
      index,
      confidence: Number(det.confidence),
      left: (x1 / naturalW) * 100,
      top: (y1 / naturalH) * 100,
      width: ((x2 - x1) / naturalW) * 100,
      height: ((y2 - y1) / naturalH) * 100,
    }
  })
}

/** Match BoundingBoxOverlay.css accents for canvas drawing. */
export const BOX_STROKE = '#3dd6a5'
export const BOX_LABEL_BG = '#3dd6a5'
export const BOX_LABEL_FG = '#06251c'

/**
 * Draw detection boxes onto a canvas using the same layout math as BoundingBoxOverlay.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ bbox: number[], confidence: number }>} detections
 * @param {number} sourceW natural video/image width
 * @param {number} sourceH natural video/image height
 */
export function drawDetectionBoxes(ctx, canvas, detections, sourceW, sourceH) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const boxes = layoutDetectionBoxes(detections, sourceW, sourceH)

  for (const box of boxes) {
    const x = (box.left / 100) * canvas.width
    const y = (box.top / 100) * canvas.height
    const w = (box.width / 100) * canvas.width
    const h = (box.height / 100) * canvas.height

    ctx.strokeStyle = BOX_STROKE
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, w, h)

    const label = `#${box.index + 1} ${(box.confidence * 100).toFixed(1)}%`
    ctx.font = '600 12px IBM Plex Mono, ui-monospace, monospace'
    const metrics = ctx.measureText(label)
    const padX = 6
    const padY = 3
    const labelH = 16
    const labelW = metrics.width + padX * 2
    const labelY = Math.max(0, y - labelH)

    ctx.fillStyle = BOX_LABEL_BG
    ctx.fillRect(x, labelY, labelW, labelH)
    ctx.fillStyle = BOX_LABEL_FG
    ctx.fillText(label, x + padX, labelY + labelH - padY - 1)
  }
}
