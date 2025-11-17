export function resolveAssetUrl(pathValue: string) {
  if (!pathValue) return ''
  if (/^(https?:|data:|file:)/.test(pathValue)) {
    return pathValue
  }
  if (pathValue.startsWith('/api/assets/')) {
    return pathValue
  }
  const normalized = pathValue.replace(/^\.\/+/, '').replace(/^\/+/, '').replace(/\\/g, '/')
  return `/api/assets/${normalized}`
}
