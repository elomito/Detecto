import { useLayoutEffect, useRef, useState } from 'react'
import { layoutDetectionBoxes } from '../utils/bboxLayout'
import './BoundingBoxOverlay.css'

/**
 * Overlay person boxes on an image using detection bboxes [x1,y1,x2,y2]
 * in natural image coordinates.
 *
 * @param {{
 *   imageSrc: string
 *   detections?: Array<{ bbox: number[], confidence: number }>
 *   alt?: string
 * }} props
 */
export default function BoundingBoxOverlay({
  imageSrc,
  detections = [],
  alt = 'Detection result',
}) {
  const imgRef = useRef(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const img = imgRef.current
    if (!img) return

    function sync() {
      if (img.naturalWidth && img.naturalHeight) {
        setNatural({ w: img.naturalWidth, h: img.naturalHeight })
      }
    }

    sync()
    img.addEventListener('load', sync)
    return () => img.removeEventListener('load', sync)
  }, [imageSrc])

  const boxes = layoutDetectionBoxes(detections, natural.w, natural.h)

  return (
    <div className="bbox-overlay">
      <img ref={imgRef} src={imageSrc} alt={alt} className="bbox-overlay__image" />
      {boxes.map((box) => (
        <div
          key={`${box.index}-${box.left}-${box.top}`}
          className="bbox-overlay__box"
          style={{
            left: `${box.left}%`,
            top: `${box.top}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
          }}
        >
          <span className="bbox-overlay__label">
            #{box.index + 1} {(box.confidence * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  )
}
