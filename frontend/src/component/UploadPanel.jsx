import { useId, useRef, useState } from 'react'
import './UploadPanel.css'

/**
 * @param {{
 *   disabled?: boolean
 *   error?: string | null
 *   file?: File | null
 *   onFileChange: (file: File | null) => void
 *   onSubmit: () => void
 * }} props
 */
export default function UploadPanel({
    disabled = false,
    error = null,
    file = null,
    onFileChange,
    onSubmit,
}) {
    const inputId = useId()
    const inputRef = useRef(null)
    const [dragging, setDragging] = useState(false)

    function acceptFile(next) {
        if (!next) {
            onFileChange(null)
            return
        }
        onFileChange(next)
    }

    function onInputChange(e) {
        const next = e.target.files?.[0] ?? null
        acceptFile(next)
    }

     function onDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (disabled) return
    const next = e.dataTransfer.files?.[0] ?? null
    acceptFile(next)
  }
  
  function onDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setDragging(true)
  }