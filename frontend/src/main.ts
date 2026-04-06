import './style.css'
import { routeFromPathname, navigateTo } from './router'
import { mountAlphaPage } from './pages/alpha'
import { mountResizePage } from './pages/resize'
import { mountCropPage } from './pages/crop'

function renderRoute() {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) return

  const route = routeFromPathname(window.location.pathname)
  if (route === 'alpha' && window.location.pathname !== '/' && window.location.pathname !== '/alpha') {
    window.history.replaceState({}, '', '/alpha')
  }

  const navigate = (href: string) => {
    navigateTo(href)
    renderRoute()
  }

  if (route === 'resize') {
    mountResizePage(app, navigate)
    return
  }
  if (route === 'crop') {
    mountCropPage(app, navigate)
    return
  }
  mountAlphaPage(app, navigate)
}

window.addEventListener('popstate', renderRoute)
renderRoute()

