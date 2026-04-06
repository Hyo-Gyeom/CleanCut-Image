import { bindHeaderNavigation, renderHeader } from '../ui/header'

type ResizeMode = 'original' | 'custom'

type ResizeState = {
  file: File | null
  originalUrl: string | null
  // 현재 적용 크기
  width: number | null
  height: number | null
  // 진짜 원본 크기(고정)
  originalWidth: number | null
  originalHeight: number | null
  // 원본 비율 유지 박스 값
  originalBoxWidth: number | null
  originalBoxHeight: number | null
  // 사용자 정의 박스 값
  customWidth: number | null
  customHeight: number | null
  format: string | null
  hasAlpha: boolean | null
  mode: ResizeMode
}

export function mountResizePage(root: HTMLElement, navigate: (href: string) => void) {
  const state: ResizeState = {
    file: null,
    originalUrl: null,
    width: null,
    height: null,
    originalWidth: null,
    originalHeight: null,
    originalBoxWidth: null,
    originalBoxHeight: null,
    customWidth: null,
    customHeight: null,
    format: null,
    hasAlpha: null,
    mode: 'original',
  }

  function revokeUrl(url: string | null) {
    if (url) URL.revokeObjectURL(url)
  }

  function setFile(file: File) {
    revokeUrl(state.originalUrl)
    const objectUrl = URL.createObjectURL(file)
    state.file = file
    state.originalUrl = objectUrl
    state.width = null
    state.height = null
    state.originalWidth = null
    state.originalHeight = null
    state.originalBoxWidth = null
    state.originalBoxHeight = null
    state.customWidth = null
    state.customHeight = null
    state.format = null
    state.hasAlpha = null
    render()

    const img = new Image()
    img.onload = () => {
      state.originalWidth = img.width
      state.originalHeight = img.height
      // 적용 크기 = 원본
      state.width = img.width
      state.height = img.height
      // 두 박스 초기값도 원본으로
      state.originalBoxWidth = img.width
      state.originalBoxHeight = img.height
      state.customWidth = img.width
      state.customHeight = img.height
      const type = file.type || ''
      let fmt = ''
      if (type) {
        const slashIdx = type.indexOf('/')
        fmt = slashIdx >= 0 ? type.slice(slashIdx + 1).toUpperCase() : type.toUpperCase()
      } else {
        const name = file.name || ''
        const dotIdx = name.lastIndexOf('.')
        fmt = dotIdx >= 0 ? name.slice(dotIdx + 1).toUpperCase() : ''
      }
      state.format = fmt || null

      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const sampleW = Math.min(64, img.width)
          const sampleH = Math.min(64, img.height)
          canvas.width = sampleW
          canvas.height = sampleH
          ctx.drawImage(img, 0, 0, sampleW, sampleH)
          const data = ctx.getImageData(0, 0, sampleW, sampleH).data
          let hasTransparent = false
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) {
              hasTransparent = true
              break
            }
          }
          state.hasAlpha = hasTransparent
        } else {
          state.hasAlpha = null
        }
      } catch {
        state.hasAlpha = null
      }

      render()
    }
    img.src = objectUrl
  }

  function render() {
    root.innerHTML = `
      ${renderHeader('resize')}
      <div class="container">
        <header class="header">
          <div class="header-inner">
            <div class="header-title">
              <h1>리사이즈</h1>
              <p class="subtitle">이미지를 올린 뒤, 원하는 크기로 리사이즈해서 알파를 유지한 채 다운로드할 수 있습니다. (기능 구현 예정)</p>
            </div>
          </div>
        </header>

        <div class="upload-zone" id="resizeUploadZone">
          <input type="file" id="resizeFileInput" accept="image/*,.avif,image/avif" hidden />
          <div class="upload-content">
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>이미지를 드래그하거나 클릭하여 선택</span>
          </div>
        </div>

        <div class="preview-row" style="${state.originalUrl ? '' : 'display:none'}">
          <div class="preview-card">
            <div class="preview-card-header">
              <h3>입력 이미지</h3>
              <span class="preview-dim">
                ${
                  state.width && state.height
                    ? `현재 적용 크기: ${state.width} x ${state.height} px`
                    : ''
                }
              </span>
            </div>
            <div class="preview-img-wrap resize-preview-wrap">
              ${
                state.originalUrl
                  ? (() => {
                      if (!state.width || !state.height) {
                        return `<img src="${state.originalUrl}" alt="리사이즈 입력" style="max-width:100%;max-height:100%;object-fit:contain;" />`
                      }
                      const MAX_W = 650
                      const MAX_H = 626
                      const scale = Math.min(1, MAX_W / state.width!, MAX_H / state.height!)
                      const dw = Math.round(state.width! * scale)
                      const dh = Math.round(state.height! * scale)
                      return `<img src="${state.originalUrl}" alt="리사이즈 입력" style="width:${dw}px;height:${dh}px;object-fit:fill;object-position:center;" />`
                    })()
                  : ''
              }
            </div>
          </div>
          <div class="preview-card">
            <h3>이미지 정보 및 수정</h3>
            <div class="preview-img-wrap info-wrap">
              <div class="img-info-section">
                <h4>원본 이미지 정보</h4>
                <p class="img-info-line">
                  크기: ${
                    state.originalWidth && state.originalHeight
                      ? `${state.originalWidth} x ${state.originalHeight} px`
                      : '-'
                  }&nbsp;&nbsp;&nbsp;&nbsp;포맷: ${state.format ?? '-'}&nbsp;&nbsp;&nbsp;&nbsp;알파 포함: ${
                    state.hasAlpha === null ? '-' : state.hasAlpha ? 'O' : 'X'
                  }
                </p>
              </div>
              <div class="img-info-section">
                <h4><label class="mode-label"><input type="radio" name="resizeMode" id="resizeModeOriginal" ${
                  state.mode === 'original' ? 'checked' : ''
                } /> 원본 비율 유지</label></h4>
                <div class="size-input-row">
                  <div class="size-input-wrap">
                    <input
                      type="number"
                      id="resizeOriginalWidth"
                      class="size-input"
                      placeholder="가로"
                      value="${state.originalBoxWidth ?? ''}"
                      ${state.mode === 'original' ? '' : 'disabled'} />
                    <span class="size-input-unit">px</span>
                  </div>
                  <span class="size-input-sep">x</span>
                  <div class="size-input-wrap">
                    <input
                      type="number"
                      id="resizeOriginalHeight"
                      class="size-input"
                      placeholder="세로"
                      value="${state.originalBoxHeight ?? ''}"
                      ${state.mode === 'original' ? '' : 'disabled'} />
                    <span class="size-input-unit">px</span>
                  </div>
                </div>
              </div>
              <div class="img-info-section">
                <h4><label class="mode-label"><input type="radio" name="resizeMode" id="resizeModeCustom" ${
                  state.mode === 'custom' ? 'checked' : ''
                } /> 사용자 정의</label></h4>
                <div class="size-input-row">
                  <div class="size-input-wrap">
                    <input
                      type="number"
                      id="resizeCustomWidth"
                      class="size-input"
                      placeholder="가로"
                      value="${state.customWidth ?? ''}"
                      ${
                      state.mode === 'custom' ? '' : 'disabled'
                    } />
                    <span class="size-input-unit">px</span>
                  </div>
                  <span class="size-input-sep">x</span>
                  <div class="size-input-wrap">
                    <input
                      type="number"
                      id="resizeCustomHeight"
                      class="size-input"
                      placeholder="세로"
                      value="${state.customHeight ?? ''}"
                      ${
                      state.mode === 'custom' ? '' : 'disabled'
                    } />
                    <span class="size-input-unit">px</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="actions top" id="resizeDownloadRow" style="${state.originalUrl ? '' : 'display:none'}">
          <button type="button" class="btn btn-primary" id="resizeDownloadOriginal">원본 포맷 다운로드</button>
          <button type="button" class="btn btn-primary" id="resizeDownloadPng">PNG 다운로드</button>
          <button type="button" class="btn btn-primary" id="resizeDownloadBmp">BMP 다운로드</button>
        </div>
        <p class="img-note" style="${state.originalUrl ? '' : 'display:none'}">
          ※ 포맷이 PNG 또는 BMP일 경우, 알파가 있으면 그대로 유지됩니다.
        </p>
      </div>
    `

    bindHeaderNavigation(root, navigate)

    const uploadZone = document.getElementById('resizeUploadZone')!
    const fileInput = document.getElementById('resizeFileInput') as HTMLInputElement
    const downloadOriginalBtn = document.getElementById('resizeDownloadOriginal')
    const downloadPngBtn = document.getElementById('resizeDownloadPng')
    const downloadBmpBtn = document.getElementById('resizeDownloadBmp')

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
      if (file && file.type.startsWith('image/')) setFile(file)
    })
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      if (file) setFile(file)
    })

    const modeOriginal = document.getElementById('resizeModeOriginal') as HTMLInputElement | null
    const modeCustom = document.getElementById('resizeModeCustom') as HTMLInputElement | null
    const originalWidthInput = document.getElementById('resizeOriginalWidth') as HTMLInputElement | null
    const originalHeightInput = document.getElementById('resizeOriginalHeight') as HTMLInputElement | null
    const customWidthInput = document.getElementById('resizeCustomWidth') as HTMLInputElement | null
    const customHeightInput = document.getElementById('resizeCustomHeight') as HTMLInputElement | null
    modeOriginal?.addEventListener('change', () => {
      if (!modeOriginal.checked) return
      state.mode = 'original'
      // 비율 유지 모드에서는 비율 박스 값을 적용 크기로 사용
      if (state.originalBoxWidth && state.originalBoxHeight) {
        state.width = state.originalBoxWidth
        state.height = state.originalBoxHeight
      }
      render()
    })
    modeCustom?.addEventListener('change', () => {
      if (!modeCustom.checked) return
      state.mode = 'custom'
      // 사용자 정의 모드로 들어올 때, 값이 비어 있으면 현재 적용 크기를 기본으로
      if (state.width && state.height && state.customWidth == null && state.customHeight == null) {
        state.customWidth = state.width
        state.customHeight = state.height
      }
      if (state.customWidth && state.customHeight) {
        state.width = state.customWidth
        state.height = state.customHeight
      }
      render()
    })

    originalWidthInput?.addEventListener('change', () => {
      if (!state.originalWidth || !state.originalHeight) return
      const v = Number(originalWidthInput.value)
      if (!Number.isFinite(v) || v <= 0) return
      const ratio = state.originalHeight / state.originalWidth
      const newH = Math.round(v * ratio)
      // 비율 유지 박스 값만 수정
      state.originalBoxWidth = v
      state.originalBoxHeight = newH
      // 이 모드일 때만 실제 적용 크기로 반영
      if (state.mode === 'original') {
        state.width = v
        state.height = newH
      }
      render()
    })

    originalHeightInput?.addEventListener('change', () => {
      if (!state.originalWidth || !state.originalHeight) return
      const v = Number(originalHeightInput.value)
      if (!Number.isFinite(v) || v <= 0) return
      const ratio = state.originalWidth / state.originalHeight
      const newW = Math.round(v * ratio)
      state.originalBoxHeight = v
      state.originalBoxWidth = newW
      if (state.mode === 'original') {
        state.width = newW
        state.height = v
      }
      render()
    })

    customWidthInput?.addEventListener('change', () => {
      const v = Number(customWidthInput.value)
      if (!Number.isFinite(v) || v <= 0) return
      state.customWidth = v
      if (state.mode === 'custom') {
        state.width = v
      }
      render()
    })

    customHeightInput?.addEventListener('change', () => {
      const v = Number(customHeightInput.value)
      if (!Number.isFinite(v) || v <= 0) return
      state.customHeight = v
      if (state.mode === 'custom') {
        state.height = v
      }
      render()
    })

    function downloadResized(type: 'image/png' | 'image/bmp', filename: string) {
      if (!state.originalUrl || !state.width || !state.height) return

      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = state.width!
        canvas.height = state.height!
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, type)
      }
      img.src = state.originalUrl
    }

    downloadOriginalBtn?.addEventListener('click', () => {
      if (!state.originalUrl || !state.file || !state.width || !state.height) return
      const name = state.file.name || 'image'
      const dot = name.lastIndexOf('.')
      const base = dot >= 0 ? name.slice(0, dot) : name
      const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '.png'
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      }
      const mime = mimeMap[ext] || 'image/png'
      const supportsAlpha = mime === 'image/png' || mime === 'image/webp'
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = state.width!
        canvas.height = state.height!
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        if (!supportsAlpha) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const quality = mime === 'image/jpeg' ? 0.95 : 1
        canvas.toBlob(
          (blob) => {
            if (!blob) return
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${base}_resize${ext}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          },
          mime,
          quality,
        )
      }
      img.src = state.originalUrl
    })

    downloadPngBtn?.addEventListener('click', () => {
      const base = state.file
        ? state.file.name.lastIndexOf('.') >= 0
          ? state.file.name.slice(0, state.file.name.lastIndexOf('.'))
          : state.file.name
        : 'resized'
      downloadResized('image/png', `${base}_resize.png`)
    })
    downloadBmpBtn?.addEventListener('click', () => {
      const base = state.file
        ? state.file.name.lastIndexOf('.') >= 0
          ? state.file.name.slice(0, state.file.name.lastIndexOf('.'))
          : state.file.name
        : 'resized'
      downloadResized('image/bmp', `${base}_resize.bmp`)
    })
  }

  render()
}

