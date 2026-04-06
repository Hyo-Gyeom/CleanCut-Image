export type RouteKey = 'alpha' | 'resize' | 'crop'

export function routeFromPathname(pathname: string): RouteKey {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/' || p === '/resize') return 'resize'
  if (p === '/alpha') return 'alpha'
  if (p === '/crop') return 'crop'
  return 'resize'
}

export function navigateTo(href: string) {
  if (href === window.location.pathname) return
  window.history.pushState({}, '', href)
}

