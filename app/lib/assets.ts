const normalizeAssetPath = (value: string) => {
  if (!value) return ''
  const sanitized = value.replace(/\\/g, '/')
  const segments: string[] = []
  sanitized.split('/').forEach((segment) => {
    if (!segment || segment === '.') return
    if (segment === '..') {
      segments.pop()
      return
    }
    segments.push(segment)
  })
  return segments.join('/')
}

export function resolveAssetUrl(pathValue: string) {
  if (!pathValue) return ''
  if (/^(https?:|data:|file:)/.test(pathValue)) {
    return pathValue
  }
  if (pathValue.startsWith('/api/assets/')) {
    const normalized = normalizeAssetPath(pathValue.slice('/api/assets/'.length))
    return `/api/assets/${normalized}`
  }
  const trimmed = pathValue.replace(/^\.\/+/, '').replace(/^\/+/, '')
  const normalized = normalizeAssetPath(trimmed)
  return `/api/assets/${normalized}`
}
