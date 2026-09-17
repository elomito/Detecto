const configuredUrl = import.meta.env.VITE_API_URL
const configuredWsUrl = import.meta.env.VITE_WS_URL
const configuredLiveFps = import.meta.env.VITE_LIVE_FPS

/** @type {string} */
export const API_URL = (configuredUrl || 'http://localhost:8080').replace(/\/$/, '')

/**
 * WebSocket URL for live detection. Prefer VITE_WS_URL; otherwise derive from API_URL.
 * @type {string}
 */
export const WS_DETECT_URL = (() => {
  if (configuredWsUrl && String(configuredWsUrl).trim()) {
    return String(configuredWsUrl).trim().replace(/\/$/, '')
  }
  const wsBase = API_URL.replace(/^http/i, (m) => (m.toLowerCase() === 'https' ? 'wss' : 'ws'))
  return `${wsBase}/ws/detect`
})()

/** Target capture rate for live webcam frames. */
export const LIVE_FPS = (() => {
  const parsed = Number(configuredLiveFps)
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 30) return parsed
  return 5
})()

if (!configuredUrl) {
  console.warn(
    '[detecto] VITE_API_URL is not set; falling back to http://localhost:8080. Copy frontend/.env.example to frontend/.env.',
  )
}

if (!configuredWsUrl) {
  console.warn(
    `[detecto] VITE_WS_URL is not set; deriving WebSocket URL as ${WS_DETECT_URL}.`,
  )
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png'])
const ALLOWED_EXT = /\.(jpe?g|png)$/i

/**
 * @param {File} file
 * @returns {string|null} error message or null if valid
 */
export function validateImageFile(file) {
  if (!file) return 'Choose a JPEG or PNG image to upload.'
  if (file.size === 0) return 'That file is empty. Choose a non-empty JPEG or PNG.'
  const typeOk = ALLOWED_TYPES.has(file.type)
  const extOk = ALLOWED_EXT.test(file.name || '')
  if (!typeOk && !extOk) {
    return 'Unsupported file type. Only JPEG and PNG images are accepted.'
  }
  return null
}

/**
 * @param {unknown} payload
 * @param {number} status
 */
function detailFromPayload(payload, status) {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = /** @type {{ detail: unknown }} */ (payload).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d) => (d && d.msg) || JSON.stringify(d)).join(' ')
    }
  }
  return `Detection failed (${status}).`
}

/**
 * POST multipart image to /detect
 * @param {File} file
 */
export async function detectPeople(file) {
  const form = new FormData()
  form.append('image', file)

  let response
  try {
    response = await fetch(`${API_URL}/detect`, {
      method: 'POST',
      body: form,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'network error'
    throw new Error(
      `Could not reach the Detecto API at ${API_URL} (${reason}). Check that the backend is running and VITE_API_URL is correct.`,
    )
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const err = new Error(detailFromPayload(payload, response.status))
    err.status = response.status
    throw err
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Detecto API returned an empty or invalid JSON response.')
  }

  return payload
}

