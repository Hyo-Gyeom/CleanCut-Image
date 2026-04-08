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

const MAX_CANVAS = 2048

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



  let prevCanvasWidth = 0
  let prevCanvasHeight = 0
  let prevOrigDisplayW = 0
  let prevOrigDisplayH = 0
  let prevResDisplayW = 0
  let prevResDisplayH = 0
  let currentLoadId = 0 // 비동기 레이스 방지용 ID

  // DOM Elements
  let uploadZoneEl: HTMLElement
  let fileInputEl: HTMLInputElement
  let previewRowEl: HTMLElement
  let originalImgWrapEl: HTMLElement
  let resultWrapEl: HTMLElement
  let actionsEl: HTMLElement
  let downloadBtnEl: HTMLButtonElement
  let downloadBmpBtnEl: HTMLButtonElement
  let maskEditorHintEl: HTMLElement
  let extractRowEl: HTMLElement
  let extractServerBtnEl: HTMLButtonElement
  let maskEditPanelEl: HTMLElement
  let brushIncludeEl: HTMLElement
  let brushExcludeEl: HTMLElement
  let brushSizeInputEl: HTMLInputElement
  let brushSizeValEl: HTMLElement
  let zoomValEl: HTMLElement
  let maskCanvasZoomWrapEl: HTMLElement
  let canvasEl: HTMLCanvasElement
  let errorEl: HTMLElement

  function initLayout() {
    root.innerHTML = `
      ${renderHeader('alpha')}
      <div class="container">
        <header class="header">
          <div class="header-inner">
            <div class="header-title">
              <h1>인물 알파 추출</h1>
              <p class="subtitle">이미지를 올린 뒤 추출하고, 필요하면 마스크를 수정해 영역을 포함할 수 있습니다.<br/><span style="font-size:0.9rem;color:#f59e0b;font-weight:700;margin-top:0.5rem;display:inline-block">※ 1인 할당량: 5장 / 일일 할당량: 100장</span></p>
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

        <div id="errorContainer"></div>

        <div class="preview-row" id="previewRow" style="display:none">
          <div class="preview-card">
            <h3>원본</h3>
            <div class="preview-img-wrap" id="originalImgWrap"></div>
          </div>
          <div class="preview-card" style="display:flex;flex-direction:column;align-items:stretch">
            <h3>결과 (알파)</h3>
            <div class="preview-img-wrap checkerboard" id="resultWrap"></div>
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:0.75rem;margin-top:1rem;width:100%">
              <div class="actions" id="actions" style="display:none">
                <button type="button" class="btn btn-primary" id="downloadBtn">PNG 다운로드</button>
                <button type="button" class="btn btn-primary" id="downloadBmpBtn">BMP 다운로드</button>
              </div>
              <p class="mask-editor-hint" id="maskEditorHint" style="display:none">
                ※ 포맷이 PNG 또는 BMP일 경우, 알파가 있으면 그대로 유지됩니다. 아래 마스크 에디터에서 포함·제외 영역을 더 세밀하게 다듬을 수 있습니다.
              </p>
            </div>
          </div>
          <div id="extractRow" style="grid-column:1/-1;display:flex;justify-content:center;align-items:center;width:100%;margin-top:1rem;display:none">
            <button type="button" class="btn btn-primary" id="extractServerBtn">알파 추출</button>
          </div>
        </div>

        <div class="mask-edit-panel" id="maskEditPanel" style="display:none">
          <h3>영역 수정 <span class="hint">초록=포함(살림), 빨강=제외(지움). 원본을 보며 포함/제외 브러시로 수정하세요.</span></h3>
          <div class="mask-toolbar">
            <div class="brush-group">
              <button type="button" class="btn btn-sm btn-outline" id="resetMaskBtn">초기화</button>
              <button type="button" class="btn btn-sm btn-outline" id="brushInclude">포함 (살리기)</button>
              <button type="button" class="btn btn-sm btn-outline" id="brushExclude">제외 (지우기)</button>
            </div>
            <label class="brush-size-label">
              브러시 크기: <input type="range" id="brushSize" min="1" max="80" value="${state.brushSize}" /> <span id="brushSizeVal">${state.brushSize}</span>
            </label>
            <div class="zoom-group">
              <span class="zoom-label">확대/축소:</span>
              <button type="button" class="btn btn-sm btn-outline" id="zoomOutBtn">축소</button>
              <button type="button" class="btn btn-sm btn-outline" id="zoomResetBtn">100%</button>
              <button type="button" class="btn btn-sm btn-outline" id="zoomInBtn">확대</button>
              <span id="zoomVal">100%</span>
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

    // Element references
    uploadZoneEl = document.getElementById('uploadZone')!
    fileInputEl = document.getElementById('fileInput') as HTMLInputElement
    previewRowEl = document.getElementById('previewRow')!
    originalImgWrapEl = document.getElementById('originalImgWrap')!
    resultWrapEl = document.getElementById('resultWrap')!
    actionsEl = document.getElementById('actions')!
    downloadBtnEl = document.getElementById('downloadBtn') as HTMLButtonElement
    downloadBmpBtnEl = document.getElementById('downloadBmpBtn') as HTMLButtonElement
    maskEditorHintEl = document.getElementById('maskEditorHint')!
    extractRowEl = document.getElementById('extractRow')!
    extractServerBtnEl = document.getElementById('extractServerBtn') as HTMLButtonElement
    maskEditPanelEl = document.getElementById('maskEditPanel')!
    brushIncludeEl = document.getElementById('brushInclude')!
    brushExcludeEl = document.getElementById('brushExclude')!
    brushSizeInputEl = document.getElementById('brushSize') as HTMLInputElement
    brushSizeValEl = document.getElementById('brushSizeVal')!
    zoomValEl = document.getElementById('zoomVal')!
    maskCanvasZoomWrapEl = document.getElementById('maskCanvasZoomWrap')!
    canvasEl = document.getElementById('maskCanvas') as HTMLCanvasElement
    errorEl = document.getElementById('errorContainer')!

    // Global listeners
    uploadZoneEl.addEventListener('click', () => fileInputEl.click())
    uploadZoneEl.addEventListener('dragover', (e) => {
      e.preventDefault()
      uploadZoneEl.classList.add('dragover')
    })
    uploadZoneEl.addEventListener('dragleave', () => uploadZoneEl.classList.remove('dragover'))
    uploadZoneEl.addEventListener('drop', (e) => {
      e.preventDefault()
      uploadZoneEl.classList.remove('dragover')
      const file = e.dataTransfer?.files[0]
      if (
        file &&
        (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.avif'))
      ) {
        setFile(file)
      }
    })
    fileInputEl.addEventListener('change', () => {
      const file = fileInputEl.files?.[0]
      if (file) setFile(file)
    })

    extractServerBtnEl.addEventListener('click', runExtractServer)

    downloadBtnEl.addEventListener('click', () => {
      if (!state.resultUrl) return
      const baseName = state.file ? (state.file.name.lastIndexOf('.') >= 0 ? state.file.name.slice(0, state.file.name.lastIndexOf('.')) : state.file.name) : 'person'

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
            a.download = `${baseName}_alpha.png`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          },
          'image/png'
        )
      }
      img.src = state.resultUrl
    })

    downloadBmpBtnEl.addEventListener('click', downloadBmp)

    brushIncludeEl.addEventListener('click', () => {
      state.brushMode = 'include'
      refreshUI()
    })
    brushExcludeEl.addEventListener('click', () => {
      state.brushMode = 'exclude'
      refreshUI()
    })
    brushSizeInputEl.addEventListener('input', () => {
      state.brushSize = Number(brushSizeInputEl.value)
      brushSizeValEl.textContent = String(state.brushSize)
    })
    document.getElementById('resetMaskBtn')?.addEventListener('click', () => {
      resetMaskCanvas()
      maskImageData = null // 기존 마스크 메모리 정리
    })
    document.getElementById('applyMaskBtn')?.addEventListener('click', applyMask)
    document.getElementById('zoomInBtn')?.addEventListener('click', () => setMaskZoom(state.maskZoom + 0.25))
    document.getElementById('zoomOutBtn')?.addEventListener('click', () => setMaskZoom(state.maskZoom - 0.25))
    document.getElementById('zoomResetBtn')?.addEventListener('click', () => setMaskZoom(1))

    refreshUI()
  }

  function showToast(msg: string, type: 'error' | 'info' = 'error') {
    let container = document.getElementById('toast-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'toast-container'
      container.className = 'toast-container'
      document.body.appendChild(container)
    }
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    toast.textContent = msg
    container.appendChild(toast)

    setTimeout(() => {
      toast.classList.add('toast-out')
      setTimeout(() => toast.remove(), 400)
    }, 3000)
  }

  function refreshUI() {
    // 1. Error
    errorEl.style.display = 'none' // 기존 텍스트 에러 표시는 숨김
    // 2. Preview Row visibility
    previewRowEl.style.display = state.originalUrl ? '' : 'none'

    // 3. Original Image
    if (state.originalUrl) {
      const img = originalImgWrapEl.querySelector('img')
      if (!img) {
        // 초기 로드 시 확장으로 간주하여 innerHTML + rAF
        originalImgWrapEl.innerHTML = `<img src="${state.originalUrl}" alt="원본" />`
        requestAnimationFrame(() => {
          const i = originalImgWrapEl.querySelector('img')
          if (i) {
            prevOrigDisplayW = i.clientWidth
            prevOrigDisplayH = i.clientHeight
          }
        })
      } else {
        const curW = img.clientWidth
        const curH = img.clientHeight
        if (curW > prevOrigDisplayW || curH > prevOrigDisplayH) {
          // 확장 시 innerHTML + rAF
          originalImgWrapEl.innerHTML = `<img src="${state.originalUrl}" alt="원본" />`
          requestAnimationFrame(() => {
            const i = originalImgWrapEl.querySelector('img')
            if (i) {
              prevOrigDisplayW = i.clientWidth
              prevOrigDisplayH = i.clientHeight
            }
          })
        } else {
          // 축소 시 단순 조절
          if (img.src !== state.originalUrl) img.src = state.originalUrl
          prevOrigDisplayW = curW
          prevOrigDisplayH = curH
        }
      }
    } else {
      originalImgWrapEl.innerHTML = ''
      prevOrigDisplayW = 0
      prevOrigDisplayH = 0
    }

    // 4. Result Wrap (Alpha)
    if (state.resultUrl) {
      const img = resultWrapEl.querySelector('img')
      if (!img) {
        // 초기 로드 시 innerHTML + rAF
        resultWrapEl.innerHTML = `<img src="${state.resultUrl}" alt="결과" />`
        requestAnimationFrame(() => {
          const i = resultWrapEl.querySelector('img')
          if (i) {
            prevResDisplayW = i.clientWidth
            prevResDisplayH = i.clientHeight
          }
        })
        actionsEl.style.display = ''
        maskEditorHintEl.style.display = 'margin:0;font-size:0.9rem;color:#a0a0b8'
      } else {
        const curW = img.clientWidth
        const curH = img.clientHeight
        if (curW > prevResDisplayW || curH > prevResDisplayH) {
          // 확장 시 innerHTML + rAF
          resultWrapEl.innerHTML = `<img src="${state.resultUrl}" alt="결과" />`
          requestAnimationFrame(() => {
            const i = resultWrapEl.querySelector('img')
            if (i) {
              prevResDisplayW = i.clientWidth
              prevResDisplayH = i.clientHeight
            }
          })
        } else {
          // 축소 시 단순 조절
          if (img.src !== state.resultUrl) img.src = state.resultUrl
          prevResDisplayW = curW
          prevResDisplayH = curH
        }
        actionsEl.style.display = ''
        maskEditorHintEl.style.display = 'margin:0;font-size:0.9rem;color:#a0a0b8'
      }
    } else if (state.loading) {
      resultWrapEl.innerHTML = '<div class="spinner"></div><p class="loading-text" id="loadingPercent">처리 중 0%</p>'
      actionsEl.style.display = 'none'
      maskEditorHintEl.style.display = 'none'
      prevResDisplayW = 0
      prevResDisplayH = 0
    } else {
      resultWrapEl.innerHTML = '<p class="placeholder">추출 버튼을 눌러주세요</p>'
      actionsEl.style.display = 'none'
      maskEditorHintEl.style.display = 'none'
      prevResDisplayW = 0
      prevResDisplayH = 0
    }

    // 5. Extract Row
    extractRowEl.style.display = state.originalUrl ? 'flex' : 'none'
    extractServerBtnEl.disabled = state.loading

    // 6. Mask Edit Panel
    maskEditPanelEl.style.display = state.maskUrl ? '' : 'none'
    if (state.maskUrl) {
      // Brush modes
      brushIncludeEl.className = `btn btn-sm ${state.brushMode === 'include' ? 'btn-primary' : 'btn-outline'}`
      brushExcludeEl.className = `btn btn-sm ${state.brushMode === 'exclude' ? 'btn-danger' : 'btn-outline'}`
      zoomValEl.textContent = `${Math.round(state.maskZoom * 100)}%`

      if (!maskCanvas) {
        setupMaskCanvas()
      }
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
    const maskSrc = state.editedMaskUrl || state.maskUrl
    const origSrc = state.originalUrl
    if (!canvasEl || !maskSrc || !origSrc) return

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


      function setupCanvasEvents() {
        if (!canvasEl) return
        canvasEl.addEventListener('mousedown', onMaskDrawStart)
        canvasEl.addEventListener('mousemove', onMaskDrawMove)
        canvasEl.addEventListener('mouseup', onMaskDrawEnd)
        canvasEl.addEventListener('mouseleave', onMaskDrawEnd)
        canvasEl.addEventListener('touchstart', onMaskTouchStart, { passive: false })
        canvasEl.addEventListener('touchmove', onMaskTouchMove, { passive: false })
        canvasEl.addEventListener('touchend', onMaskDrawEnd)

        const wrap = document.getElementById('maskCanvasWrap')
        const cursorEl = document.getElementById('brushCursor')
        const updateCursor = (e: MouseEvent) => {
          if (!maskCanvas || !cursorEl || !wrap) return
          const wrapRect = wrap.getBoundingClientRect()
          const canvasRect = canvasEl.getBoundingClientRect()
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
      }

      const performSetup = () => {
        const isExp = w > prevCanvasWidth || h > prevCanvasHeight
        if (isExp) {
          // 확장 시 innerHTML + rAF
          maskCanvasZoomWrapEl.innerHTML = '<canvas id="maskCanvas"></canvas>'
          requestAnimationFrame(() => {
            canvasEl = document.getElementById('maskCanvas') as HTMLCanvasElement
            canvasEl.width = w
            canvasEl.height = h
            const ctx = canvasEl.getContext('2d')
            if (!ctx) return
            maskCanvas = canvasEl
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

            canvasEl.style.width = '100%'
            canvasEl.style.height = '100%'
            canvasEl.style.display = 'block'

            if (maskCanvasZoomWrapEl) {
              maskCanvasZoomWrapEl.style.width = w * state.maskZoom + 'px'
              maskCanvasZoomWrapEl.style.height = h * state.maskZoom + 'px'
            }

            setupCanvasEvents()
          })
        } else {
          // 축소 시 단순 조절
          canvasEl.width = w
          canvasEl.height = h
          const ctx = canvasEl.getContext('2d')
          if (ctx) {
            maskCanvas = canvasEl
            maskCtx = ctx
            originalImageForMask = origImg
            const mCan = document.createElement('canvas')
            mCan.width = w
            mCan.height = h
            const mCtx = mCan.getContext('2d')!
            mCtx.drawImage(maskImg, 0, 0, w, h)
            maskImageData = mCtx.getImageData(0, 0, w, h)
            const d = maskImageData.data
            for (let i = 0; i < d.length; i += 4) {
              const v = d[i]
              d[i] = d[i + 1] = d[i + 2] = d[i + 3] = v
            }
            drawMaskDisplay()
          }

          if (maskCanvasZoomWrapEl) {
            maskCanvasZoomWrapEl.style.width = w * state.maskZoom + 'px'
            maskCanvasZoomWrapEl.style.height = h * state.maskZoom + 'px'
          }
        }

        prevCanvasWidth = w
        prevCanvasHeight = h
      }

      const isExpGlobal = w > prevCanvasWidth || h > prevCanvasHeight
      if (isExpGlobal) {
        requestAnimationFrame(performSetup)
      } else {
        performSetup()
      }
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
    if (maskCanvasZoomWrapEl && maskCanvas) {
      maskCanvasZoomWrapEl.style.width = maskCanvas.width * state.maskZoom + 'px'
      maskCanvasZoomWrapEl.style.height = maskCanvas.height * state.maskZoom + 'px'
    }
    if (zoomValEl) zoomValEl.textContent = `${Math.round(state.maskZoom * 100)}%`
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
      showToast(state.error, 'error')
      refreshUI()
      return
    }

    revokeUrl(state.resultUrl)
    state.loading = true
    state.error = null
    refreshUI()

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
          refreshUI()
          return
        }
        if (state.resultUrl) revokeUrl(state.resultUrl) // 이전 결과 URL 먼저 지움
        state.resultUrl = URL.createObjectURL(blob)
        // 새로 결과 나왔으니 여기서 캔버스관련 메모리 안쓰면 정리해줌 (UI는 유지)
        if (maskCanvas) {
          maskCanvas.width = 0
          maskCanvas.height = 0
        }
        maskImageData = null
        originalImageForMask = null

        state.step = 'result'
        state.loading = false
        refreshUI()
      }, 'image/png')
    } catch (e) {
      state.error = e instanceof Error ? e.message : '마스크 적용 중 오류가 발생했습니다.'
      showToast(state.error, 'error')
      state.loading = false
      refreshUI()
    }
  }

  function revokeUrl(url: string | string[] | null) {
    if (!url) return
    if (Array.isArray(url)) {
      url.forEach((u) => {
        if (u) URL.revokeObjectURL(u)
      })
      return
    }
    URL.revokeObjectURL(url)
  }

  function cleanupResources(preserveOriginal: boolean = false) {
    if (!preserveOriginal) {
      revokeUrl(state.originalUrl)
      state.originalUrl = null
    }
    const urlsToRevoke: string[] = []
    if (state.maskUrl) {
      urlsToRevoke.push(state.maskUrl)
      state.maskUrl = null
    }
    if (state.editedMaskUrl) {
      urlsToRevoke.push(state.editedMaskUrl)
      state.editedMaskUrl = null
    }
    if (state.resultUrl) {
      urlsToRevoke.push(state.resultUrl)
      state.resultUrl = null
    }

    revokeUrl(urlsToRevoke)

    if (maskCanvas) {
      maskCanvas.width = 0
      maskCanvas.height = 0
      maskCtx = null
      maskImageData = null
      originalImageForMask = null
      maskCanvas = null
    }
  }

  function isAvif(file: File): boolean {
    return file.type === 'image/avif' || file.name.toLowerCase().endsWith('.avif')
  }

  function setFile(file: File) {
    const oldOriginal = state.originalUrl
    cleanupResources(true) // 즉시 기존 화면 비움 (사용자 지시 사항)

    if (isAvif(file)) {
      if (oldOriginal) revokeUrl(oldOriginal)
      state.file = null
      state.originalUrl = null
      state.error = 'AVIF는 지원하지 않습니다. JPG, PNG, WEBP 등 다른 형식을 사용해 주세요.'
      state.step = 'upload'
      showToast(state.error, 'error')
      refreshUI()
      return
    }

    const loadId = ++currentLoadId
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      if (loadId !== currentLoadId) {
        URL.revokeObjectURL(url)
        return
      }

      if (img.width > MAX_CANVAS || img.height > MAX_CANVAS) {
        URL.revokeObjectURL(url)
        if (oldOriginal) state.originalUrl = oldOriginal // 원본 복구 시도 (또는 null 유지)
        state.file = null
        state.originalUrl = null
        state.error = `${MAX_CANVAS}px 이하의 이미지만 지원합니다.`
        state.step = 'upload'
        state.loading = false
        showToast(state.error, 'error')
        refreshUI()
        return
      }

      state.file = file
      state.originalUrl = url
      state.maskUrl = null
      state.editedMaskUrl = null
      state.resultUrl = null
      state.error = null
      state.step = 'upload'
      state.loading = false

      if (oldOriginal) revokeUrl(oldOriginal)
      refreshUI()
    }
    img.onerror = () => {
      if (loadId !== currentLoadId) {
        URL.revokeObjectURL(url)
        return
      }
      URL.revokeObjectURL(url)
      state.file = null
      state.originalUrl = null
      state.loading = false
      showToast('이미지를 불러오는데 실패했습니다.', 'error')
      refreshUI()
    }
    img.src = url
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
    refreshUI()

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
          const detail = (j as { detail?: string }).detail || ''

          if (detail.includes('금일 할당량')) {
            state.error = '일일 할당량 100장을 초과하였습니다'
          } else {
            // 그 외의 429는 무조건 1인 할당량 초과로 간주 (백엔드 로직 기준)
            state.error = '1인 5장 할당량을 초과하였습니다'
          }

          showToast(state.error, 'error')
          refreshUI()
          return
        }
        const text = await res.text()
        throw new Error(text || res.statusText || '오류가 발생했습니다.')
      }
      const blob = await res.blob()

      // 서버에서 새 결과가 도착했으므로 이전 결과와 캔버스는 비움 (원본 이미지는 화면에 둬야 하므로 유지)
      cleanupResources(true)

      state.resultUrl = URL.createObjectURL(blob)
      const maskBlob = await createMaskBlobFromAlphaPng(blob)
      state.maskUrl = URL.createObjectURL(maskBlob)
      state.editedMaskUrl = null
      state.step = 'mask'
    } catch (e) {
      state.error = e instanceof Error ? e.message : '오류가 발생했습니다.'
      showToast(state.error, 'error')
    } finally {
      state.loading = false
      refreshUI()
    }
  }

  initLayout()
}
