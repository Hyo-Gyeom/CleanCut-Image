import { bindHeaderNavigation, renderHeader } from '../ui/header'

type BrushMode = 'include' | 'exclude'
type ModelStatus = 'idle' | 'loading' | 'ready'
type State = {
  file: File | null
  originalUrl: string | null
  maskUrl: string | null
  editedMaskUrl: string | null
  resultUrl: string | null
  loading: boolean
  error: string | null
  step: 'upload' | 'mask' | 'result'
  brushMode: BrushMode
  brushSize: number
  modelStatus: ModelStatus
  maskZoom: number
}

const MODEL_READY_KEY = 'bg-removal-model-ready'

/** 브라우저 주소와 같은 호스트의 8000 포트로 요청 */
function apiBase(): string {
  if (typeof window === 'undefined') return 'http://127.0.0.1:8000'
  return `${window.location.protocol}//${window.location.hostname}:8000`
}
function removeBgApiUrl(): string {
  return `${apiBase()}/remove-bg`
}

function getModelStatus(key: string): ModelStatus {
  return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1' ? 'ready' : 'idle'
}

const MAX_CANVAS = 4096

export function mountAlphaPage(root: HTMLElement, navigate: (href: string) => void) {
  const state: State = {
    file: null,
    originalUrl: null,
    maskUrl: null,
    editedMaskUrl: null,
    resultUrl: null,
    loading: false,
    error: null,
    step: 'upload',
    brushMode: 'include',
    brushSize: 24,
    modelStatus: getModelStatus(MODEL_READY_KEY),
    maskZoom: 1,
  }

  let maskCanvas: HTMLCanvasElement | null = null
  let maskCtx: CanvasRenderingContext2D | null = null
  let maskImageData: ImageData | null = null
  let originalImageForMask: HTMLImageElement | null = null
  let isDrawing = false

  const modelRow = `
      <div class="model-status-item">
        <span class="model-badge model-ready">InSPyReNet</span>
      </div>
    `

  function revokeUrl(url: string | null) {
    if (url) URL.revokeObjectURL(url)
  }

  function render() {
    root.innerHTML = `
      ${renderHeader('alpha')}
      <div class="container">
        <header class="header">
          <div class="header-inner">
            <div class="header-title">
              <h1>인물 알파 추출</h1>
              <p class="subtitle">이미지를 올린 뒤 추출하고, 필요하면 마스크를 수정해 옷 등 영역을 포함할 수 있습니다.</p>
            </div>
            <div class="model-status model-status-two">${modelRow}</div>
          </div>
        </header>

        <div class="upload-zone" id="uploadZone">
          <input type="file" id="fileInput" accept="image/*,.avif,image/avif" hidden />
          <div class="upload-content" id="uploadContent">
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>이미지를 드래그하거나 클릭하여 선택</span>
          </div>
        </div>

        ${state.error ? `<p class="error">${state.error}</p>` : ''}

        <div class="preview-row" id="previewRow" style="${state.originalUrl ? '' : 'display:none'}">
          <div class="preview-card">
            <h3>원본</h3>
            <div class="preview-img-wrap">
              ${state.originalUrl ? `<img src="${state.originalUrl}" alt="원본" />` : ''}
            </div>
          </div>
          <div class="preview-card" style="display:flex;flex-direction:column;align-items:stretch">
            <h3>결과 (알파)</h3>
            <div class="preview-img-wrap checkerboard" id="resultWrap">
              ${state.resultUrl
        ? `<img src="${state.resultUrl}" alt="결과" />`
        : state.loading
          ? '<div class="spinner"></div><p class="loading-text" id="loadingPercent">처리 중 0%</p>'
          : '<p class="placeholder">추출 버튼을 눌러주세요</p>'
      }
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:0.75rem;margin-top:1rem;width:100%">
              <div class="actions" id="actions" style="${state.resultUrl ? '' : 'display:none'}">
                <a id="downloadBtn" class="btn btn-primary" href="${state.resultUrl || '#'}" download="${state.file ? (state.file.name.lastIndexOf('.') >= 0 ? state.file.name.slice(0, state.file.name.lastIndexOf('.')) : state.file.name) + '_alpha.png' : 'person-alpha.png'}">PNG 다운로드</a>
                <button type="button" class="btn btn-primary" id="downloadBmpBtn">BMP 다운로드</button>
              </div>
              <p class="mask-editor-hint" id="maskEditorHint" style="${state.resultUrl ? 'margin:0;font-size:0.9rem;color:#a0a0b8' : 'display:none'}">
                ※ 포맷이 PNG 또는 BMP일 경우, 알파가 있으면 그대로 유지됩니다. 아래 마스크 에디터에서 포함·제외 영역을 더 세밀하게 다듬을 수 있습니다.
              </p>
            </div>
          </div>
          <div id="extractRow" style="${state.originalUrl ? 'grid-column:1/-1;display:flex;justify-content:center;align-items:center;width:100%;margin-top:1rem' : 'display:none'}">
            <button type="button" class="btn btn-primary" id="extractServerBtn" ${state.loading ? 'disabled' : ''}>알파 추출</button>
          </div>
        </div>

        <div class="mask-edit-panel" id="maskEditPanel" style="${state.maskUrl ? '' : 'display:none'}">
          <h3>영역 수정 <span class="hint">초록=포함(살림), 빨강=제외(지움). 원본을 보며 포함/제외 브러시로 수정하세요.</span></h3>
          <div class="mask-toolbar">
            <div class="brush-group">
              <button type="button" class="btn btn-sm btn-outline" id="resetMaskBtn">초기화</button>
              <button type="button" class="btn btn-sm ${state.brushMode === 'include' ? 'btn-primary' : 'btn-outline'}" id="brushInclude">포함 (살리기)</button>
              <button type="button" class="btn btn-sm ${state.brushMode === 'exclude' ? 'btn-danger' : 'btn-outline'}" id="brushExclude">제외 (지우기)</button>
            </div>
            <label class="brush-size-label">
              브러시 크기: <input type="range" id="brushSize" min="1" max="80" value="${state.brushSize}" /> <span id="brushSizeVal">${state.brushSize}</span>
            </label>
            <div class="zoom-group">
              <span class="zoom-label">확대/축소:</span>
              <button type="button" class="btn btn-sm btn-outline" id="zoomOutBtn">축소</button>
              <button type="button" class="btn btn-sm btn-outline" id="zoomResetBtn">100%</button>
              <button type="button" class="btn btn-sm btn-outline" id="zoomInBtn">확대</button>
              <span id="zoomVal">${Math.round(state.maskZoom * 100)}%</span>
              <button type="button" class="btn btn-sm btn-primary" id="applyMaskBtn">수정된 마스크로 결과 적용</button>
            </div>
          </div>
          <div class="mask-canvas-wrap" id="maskCanvasWrap">
            <div class="mask-canvas-zoom" id="maskCanvasZoomWrap">
              <canvas id="maskCanvas"></canvas>
            </div>
            <div class="brush-cursor" id="brushCursor" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    `

    bindHeaderNavigation(root, navigate)

    const uploadZone = document.getElementById('uploadZone')!
    const fileInput = document.getElementById('fileInput') as HTMLInputElement
    const brushInclude = document.getElementById('brushInclude')
    const brushExclude = document.getElementById('brushExclude')
    const brushSizeInput = document.getElementById('brushSize') as HTMLInputElement
    const brushSizeVal = document.getElementById('brushSizeVal')
    const applyMaskBtn = document.getElementById('applyMaskBtn')
    const downloadBmpBtn = document.getElementById('downloadBmpBtn')

    uploadZone.addEventListener('click', () => fileInput.click())
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault()
      uploadZone.classList.add('dragover')
    })
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'))
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault()
      uploadZone.classList.remove('dragover')
      const file = e.dataTransfer?.files[0]
      if (
        file &&
        (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.avif'))
      ) {
        setFile(file)
      }
    })
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      if (file) setFile(file)
    })

    document.getElementById('extractServerBtn')?.addEventListener('click', runExtractServer)
    downloadBmpBtn?.addEventListener('click', downloadBmp)

    brushInclude?.addEventListener('click', () => {
      state.brushMode = 'include'
      brushInclude?.classList.add('btn-primary')
      brushInclude?.classList.remove('btn-outline')
      brushExclude?.classList.remove('btn-danger')
      brushExclude?.classList.add('btn-outline')
    })
    brushExclude?.addEventListener('click', () => {
      state.brushMode = 'exclude'
      brushExclude?.classList.add('btn-danger')
      brushExclude?.classList.remove('btn-outline')
      brushInclude?.classList.remove('btn-primary')
      brushInclude?.classList.add('btn-outline')
    })
    brushSizeInput?.addEventListener('input', () => {
      state.brushSize = Number(brushSizeInput.value)
      if (brushSizeVal) brushSizeVal.textContent = String(state.brushSize)
    })
    document.getElementById('resetMaskBtn')?.addEventListener('click', resetMaskCanvas)
    applyMaskBtn?.addEventListener('click', applyMask)
    document.getElementById('zoomInBtn')?.addEventListener('click', () => setMaskZoom(state.maskZoom + 0.25))
    document.getElementById('zoomOutBtn')?.addEventListener('click', () => setMaskZoom(state.maskZoom - 0.25))
    document.getElementById('zoomResetBtn')?.addEventListener('click', () => setMaskZoom(1))

    if (state.maskUrl) {
      setupMaskCanvas()
    }
  }

  function drawMaskDisplay() {
    if (!maskCanvas || !maskCtx || !maskImageData || !originalImageForMask) return
    const w = maskCanvas.width
    const h = maskCanvas.height
    maskCtx.drawImage(originalImageForMask, 0, 0, w, h)
    const overlay = maskCtx.getImageData(0, 0, w, h)
    const mask = maskImageData.data
    for (let i = 0; i < mask.length; i += 4) {
      const v = mask[i + 3]
      const a = 0.45
      if (v > 127) {
        overlay.data[i] = Math.round(overlay.data[i] * (1 - a) + 0 * a)
        overlay.data[i + 1] = Math.round(overlay.data[i + 1] * (1 - a) + 255 * a)
        overlay.data[i + 2] = Math.round(overlay.data[i + 2] * (1 - a) + 0 * a)
      } else {
        overlay.data[i] = Math.round(overlay.data[i] * (1 - a) + 255 * a)
        overlay.data[i + 1] = Math.round(overlay.data[i + 1] * (1 - a) + 0 * a)
        overlay.data[i + 2] = Math.round(overlay.data[i + 2] * (1 - a) + 0 * a)
      }
    }
    maskCtx.putImageData(overlay, 0, 0)
  }

  function setupMaskCanvas() {
    const canvas = document.getElementById('maskCanvas') as HTMLCanvasElement
    const maskSrc = state.editedMaskUrl || state.maskUrl
    const origSrc = state.originalUrl
    if (!canvas || !maskSrc || !origSrc) return

    const maskImg = new Image()
    maskImg.crossOrigin = 'anonymous'
    const origImg = new Image()
    origImg.crossOrigin = 'anonymous'

    let loaded = 0
    const tryInit = () => {
      if (++loaded < 2) return
      let w = maskImg.width
      let h = maskImg.height
      if (w > MAX_CANVAS || h > MAX_CANVAS) {
        const r = Math.min(MAX_CANVAS / w, MAX_CANVAS / h)
        w = Math.round(w * r)
        h = Math.round(h * r)
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      maskCanvas = canvas
      maskCtx = ctx
      originalImageForMask = origImg

      const maskCan = document.createElement('canvas')
      maskCan.width = w
      maskCan.height = h
      const mCtx = maskCan.getContext('2d')!
      mCtx.drawImage(maskImg, 0, 0, w, h)
      maskImageData = mCtx.getImageData(0, 0, w, h)
      const d = maskImageData.data
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i]
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = v
      }
      drawMaskDisplay()

      const zoomWrap = document.getElementById('maskCanvasZoomWrap')
      if (zoomWrap) {
        zoomWrap.style.width = w * state.maskZoom + 'px'
        zoomWrap.style.height = h * state.maskZoom + 'px'
      }
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.display = 'block'

      const wrap = document.getElementById('maskCanvasWrap')
      const cursorEl = document.getElementById('brushCursor')
      const updateCursor = (e: MouseEvent) => {
        if (!maskCanvas || !cursorEl || !wrap) return
        const wrapRect = wrap.getBoundingClientRect()
        const canvasRect = canvas.getBoundingClientRect()
        const scale = canvasRect.width / maskCanvas.width
        const radiusPx = (state.brushSize / 2) * scale
        const cx = e.clientX - wrapRect.left + wrap.scrollLeft
        const cy = e.clientY - wrapRect.top + wrap.scrollTop
        cursorEl.style.width = radiusPx * 2 + 'px'
        cursorEl.style.height = radiusPx * 2 + 'px'
        cursorEl.style.left = cx - radiusPx + 'px'
        cursorEl.style.top = cy - radiusPx + 'px'
        cursorEl.style.display = 'block'
      }
      wrap?.addEventListener('mousemove', updateCursor)
      wrap?.addEventListener('mouseleave', () => {
        cursorEl?.style.setProperty('display', 'none')
      })

      canvas.addEventListener('mousedown', onMaskDrawStart)
      canvas.addEventListener('mousemove', onMaskDrawMove)
      canvas.addEventListener('mouseup', onMaskDrawEnd)
      canvas.addEventListener('mouseleave', onMaskDrawEnd)
      canvas.addEventListener('touchstart', onMaskTouchStart, { passive: false })
      canvas.addEventListener('touchmove', onMaskTouchMove, { passive: false })
      canvas.addEventListener('touchend', onMaskDrawEnd)
    }
    maskImg.onload = tryInit
    origImg.onload = tryInit
    maskImg.src = maskSrc
    origImg.src = origSrc
  }

  function getCanvasPoint(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
    if (!maskCanvas) return null
    const rect = maskCanvas.getBoundingClientRect()
    const scaleX = maskCanvas.width / rect.width
    const scaleY = maskCanvas.height / rect.height
    if ('touches' in e && e.touches.length) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    if ('clientX' in e) {
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
    }
    return null
  }

  function drawBrush(x: number, y: number) {
    if (!maskImageData || !maskCanvas) return
    const size = Math.max(1, state.brushSize)
    const targetValue = state.brushMode === 'include' ? 255 : 0
    const d = maskImageData.data
    const w = maskCanvas.width
    const h = maskCanvas.height
    const r = Math.max(0.5, size / 2)
    const r2 = r * r
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const dist2 = dx * dx + dy * dy
        if (dist2 > r2) continue
        const dist = Math.sqrt(dist2)
        const t = dist / r
        const falloff = 1 - t * t * (3 - 2 * t)
        const px = Math.round(x) + dx
        const py = Math.round(y) + dy
        if (px < 0 || px >= w || py < 0 || py >= h) continue
        const i = (py * w + px) * 4
        const current = d[i + 3]
        const blended = Math.round(current * (1 - falloff) + targetValue * falloff)
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = blended
      }
    }
    drawMaskDisplay()
  }

  function onMaskDrawStart(e: MouseEvent) {
    e.preventDefault()
    const p = getCanvasPoint(e)
    if (p) {
      isDrawing = true
      drawBrush(p.x, p.y)
    }
  }

  function onMaskDrawMove(e: MouseEvent) {
    e.preventDefault()
    if (!isDrawing) return
    const p = getCanvasPoint(e)
    if (p) drawBrush(p.x, p.y)
  }

  function onMaskDrawEnd() {
    isDrawing = false
  }

  function onMaskTouchStart(e: TouchEvent) {
    e.preventDefault()
    const p = getCanvasPoint(e)
    if (p) {
      isDrawing = true
      drawBrush(p.x, p.y)
    }
  }

  function onMaskTouchMove(e: TouchEvent) {
    e.preventDefault()
    if (!isDrawing) return
    const p = getCanvasPoint(e)
    if (p) drawBrush(p.x, p.y)
  }

  function setMaskZoom(zoom: number) {
    state.maskZoom = Math.max(0.25, Math.min(3, zoom))
    const zoomWrap = document.getElementById('maskCanvasZoomWrap')
    const valEl = document.getElementById('zoomVal')
    if (zoomWrap && maskCanvas) {
      zoomWrap.style.width = maskCanvas.width * state.maskZoom + 'px'
      zoomWrap.style.height = maskCanvas.height * state.maskZoom + 'px'
    }
    if (valEl) valEl.textContent = `${Math.round(state.maskZoom * 100)}%`
  }

  function resetMaskCanvas() {
    if (!maskCanvas || !maskCtx || !maskImageData || !state.maskUrl) return
    state.editedMaskUrl = null
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      let w = img.width
      let h = img.height
      if (w > MAX_CANVAS || h > MAX_CANVAS) {
        const r = Math.min(MAX_CANVAS / w, MAX_CANVAS / h)
        w = Math.round(w * r)
        h = Math.round(h * r)
      }
      const tmp = document.createElement('canvas')
      tmp.width = w
      tmp.height = h
      tmp.getContext('2d')!.drawImage(img, 0, 0, w, h)
      const id = tmp.getContext('2d')!.getImageData(0, 0, w, h)
      const d = maskImageData!.data
      for (let i = 0; i < d.length; i += 4) {
        const v = id.data[i]
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = v
      }
      drawMaskDisplay()
    }
    img.src = state.maskUrl
  }

  function applyMask() {
    if (!state.file) return
    if (!maskImageData || !maskCanvas || !originalImageForMask) {
      state.error = '마스크를 먼저 추출해 주세요.'
      render()
      return
    }

    revokeUrl(state.resultUrl)
    state.loading = true
    state.error = null
    render()

    const w = maskCanvas.width
    const h = maskCanvas.height

    try {
      const outCanvas = document.createElement('canvas')
      outCanvas.width = w
      outCanvas.height = h
      const outCtx = outCanvas.getContext('2d')
      if (!outCtx) throw new Error('캔버스 컨텍스트 생성 실패')

      outCtx.drawImage(originalImageForMask, 0, 0, w, h)
      const outData = outCtx.getImageData(0, 0, w, h)
      const outPixels = outData.data
      const maskPixels = maskImageData.data

      for (let i = 0; i < outPixels.length; i += 4) {
        const a = maskPixels[i + 3]
        outPixels[i + 3] = a
      }
      outCtx.putImageData(outData, 0, 0)

      outCanvas.toBlob((blob) => {
        if (!blob) {
          state.error = '결과 이미지를 생성하지 못했습니다.'
          state.loading = false
          render()
          return
        }
        state.resultUrl = URL.createObjectURL(blob)
        state.step = 'result'
        state.loading = false
        render()
      }, 'image/png')
    } catch (e) {
      state.error = e instanceof Error ? e.message : '마스크 적용 중 오류가 발생했습니다.'
      state.loading = false
      render()
    }
  }

  function isAvif(file: File): boolean {
    return file.type === 'image/avif' || file.name.toLowerCase().endsWith('.avif')
  }

  function setFile(file: File) {
    if (isAvif(file)) {
      revokeUrl(state.originalUrl)
      revokeUrl(state.maskUrl)
      revokeUrl(state.editedMaskUrl)
      revokeUrl(state.resultUrl)
      state.file = null
      state.originalUrl = null
      state.maskUrl = null
      state.editedMaskUrl = null
      state.resultUrl = null
      state.error = 'AVIF는 지원하지 않습니다. JPG, PNG, WEBP 등 다른 형식을 사용해 주세요.'
      state.step = 'upload'
      render()
      return
    }
    revokeUrl(state.originalUrl)
    revokeUrl(state.maskUrl)
    revokeUrl(state.editedMaskUrl)
    revokeUrl(state.resultUrl)
    state.file = file
    state.originalUrl = URL.createObjectURL(file)
    state.maskUrl = null
    state.editedMaskUrl = null
    state.resultUrl = null
    state.error = null
    state.step = 'upload'
    render()
  }

  function createMaskBlobFromAlphaPng(pngBlob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(pngBlob)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const w = img.width
        const h = img.height
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const id = ctx.getImageData(0, 0, w, h)
        const d = id.data
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3]
          d[i] = d[i + 1] = d[i + 2] = d[i + 3] = a
        }
        ctx.putImageData(id, 0, 0)
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('서버 결과 이미지 로드 실패'))
      }
      img.src = url
    })
  }

  function downloadBmp() {
    if (!state.resultUrl) return
    const base = state.file
      ? state.file.name.lastIndexOf('.') >= 0
        ? state.file.name.slice(0, state.file.name.lastIndexOf('.'))
        : state.file.name
      : 'person'

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${base}_alpha.bmp`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        },
        'image/bmp',
        1,
      )
    }
    img.src = state.resultUrl
  }

  async function runExtractServer() {
    if (!state.file) return
    state.loading = true
    state.error = null
    render()
    const oldResultUrl = state.resultUrl
    const oldMaskUrl = state.maskUrl
    try {
      const form = new FormData()
      form.append('file', state.file)
      const res = await fetch(removeBgApiUrl(), {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        if (res.status === 429) {
          const j = await res.json().catch(() => ({}))
          state.error =
            (j as { detail?: string }).detail || '요청을 처리할 수 없습니다.'
          return
        }
        const text = await res.text()
        throw new Error(text || `서버 오류 ${res.status}`)
      }
      const blob = await res.blob()
      revokeUrl(oldResultUrl)
      revokeUrl(oldMaskUrl)
      revokeUrl(state.editedMaskUrl)
      state.resultUrl = URL.createObjectURL(blob)
      const maskBlob = await createMaskBlobFromAlphaPng(blob)
      state.maskUrl = URL.createObjectURL(maskBlob)
      state.editedMaskUrl = null
      state.step = 'mask'
    } catch (e) {
      state.error =
        e instanceof Error ? e.message : '서버 고품질 추출 중 오류가 발생했습니다. 로컬 서버가 실행 중인지 확인하세요 (cd backend && uvicorn main:app --reload).'
    } finally {
      state.loading = false
      render()
    }
  }

  render()
}

