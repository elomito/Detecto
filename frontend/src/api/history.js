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

