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

  function onDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }

  return (
    <section className="upload-panel" aria-labelledby={`${inputId}-title`}>
      <div className="upload-panel__header">
        <h2 id={`${inputId}-title`}>Upload image</h2>
        <p>JPEG or PNG, one image at a time.</p>
      </div>

      <div
        className={[
          'upload-panel__dropzone',
          dragging ? 'is-dragging' : '',
          disabled ? 'is-disabled' : '',
          error ? 'has-error' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        aria-describedby={error ? `${inputId}-error` : undefined}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          disabled={disabled}
          onChange={onInputChange}
          hidden
        />
        <span className="upload-panel__icon" aria-hidden="true" />
        <p className="upload-panel__prompt">
          {file ? (
            <>
              <strong>{file.name}</strong>
              <span>
                {(file.size / 1024).toFixed(1)} KB — drop another file to replace
              </span>
            </>
          ) : (
            <>
              <strong>Drop an image here</strong>
              <span>or click to browse</span>
            </>
          )}
        </p>
      </div>

      {error ? (
        <p id={`${inputId}-error`} className="upload-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="upload-panel__actions">
        <button
          type="button"
          className="upload-panel__submit"
          disabled={disabled || !file}
          onClick={onSubmit}
        >
          {disabled ? 'Detecting…' : 'Detect people'}
        </button>
        {file ? (
          <button
            type="button"
            className="upload-panel__clear"
            disabled={disabled}
            onClick={() => {
              if (inputRef.current) inputRef.current.value = ''
              onFileChange(null)
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
    </section>
  )
}
