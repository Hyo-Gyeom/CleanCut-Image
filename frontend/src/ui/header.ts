export type NavKey = 'resize' | 'crop' | 'alpha'

function navItem(label: string, href: string, key: NavKey, active: NavKey) {
  const cls = key === active ? 'site-nav-link active' : 'site-nav-link'
  return `<a class="${cls}" href="${href}" data-nav href="${href}">${label}</a>`
}

export function renderHeader(active: NavKey) {
  return `
    <header class="site-header">
      <div class="site-header-inner">
        <a class="site-brand" href="/resize" data-nav>CleanCut Image</a>
        <nav class="site-nav" aria-label="메인 메뉴">
          ${navItem('리사이즈', '/resize', 'resize', active)}
          ${navItem('크롭', '/crop', 'crop', active)}
          ${navItem('인물 알파 추출', '/alpha', 'alpha', active)}
        </nav>
        <div class="site-header-right"></div>
      </div>
    </header>
  `
}

export function bindHeaderNavigation(root: HTMLElement, navigate: (href: string) => void) {
  const links = root.querySelectorAll<HTMLAnchorElement>('[data-nav]')
  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href')
      if (!href) return
      // 새 탭/다른 버튼은 기본 동작 유지
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      e.preventDefault()
      navigate(href)
    })
  })
}

