import { API_URL } from './detect'

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
  return `Request failed (${status}).`
}

/**
 * @param {Record<string, string | number | undefined>} [filters]
 */
function buildHistoryQuery(filters = {}) {
  const params = new URLSearchParams()
  if (filters.start) params.set('start', String(filters.start))
  if (filters.end) params.set('end', String(filters.end))
  if (filters.min_confidence != null) {
    params.set('min_confidence', String(filters.min_confidence))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

/**
 * @param {Record<string, string | number | undefined>} [filters]
 */
export async function fetchHistory(filters = {}) {
  let response
  try {
    response = await fetch(`${API_URL}/history${buildHistoryQuery(filters)}`)
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
    throw new Error(detailFromPayload(payload, response.status))
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Detecto API returned an empty or invalid JSON response.')
  }

  return payload
}

/**
 * @param {string | null | undefined} disposition
 */
function filenameFromDisposition(disposition) {
  if (!disposition) return 'detecto-history.csv'
  const match = /filename="([^"]+)"/i.exec(disposition)
  return match?.[1] || 'detecto-history.csv'
}

/**
 * @param {Record<string, string | number | undefined>} [filters]
 */
export async function downloadHistoryCsv(filters = {}) {
  let response
  try {
    response = await fetch(`${API_URL}/history/export${buildHistoryQuery(filters)}`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'network error'
    throw new Error(
      `Could not reach the Detecto API at ${API_URL} (${reason}). Check that the backend is running and VITE_API_URL is correct.`,
    )
  }

  if (!response.ok) {
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    throw new Error(detailFromPayload(payload, response.status))
  }

  const blob = await response.blob()
  const filename = filenameFromDisposition(response.headers.get('Content-Disposition'))
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
