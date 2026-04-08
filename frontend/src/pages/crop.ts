import { bindHeaderNavigation, renderHeader } from '../ui/header'

type CropMode = 'original' | 'custom'

type CropState = {
  file: File | null
  // 현재 화면에 보여주는 이미지 URL (크롭 후 변경될 수 있음)
  originalUrl: string | null
  // 업로드한 최초 원본 이미지 URL (항상 유지)
  sourceUrl: string | null
  // 현재 적용 크기
  width: number | null
  height: number | null
  // 현재 이미지 크기(크롭 후 변경될 수 있음)
  originalWidth: number | null
  originalHeight: number | null
  // 최초 원본 크기(항상 유지)
  sourceWidth: number | null
  sourceHeight: number | null
  // 원본 비율 유지 박스 값
  originalBoxWidth: number | null
  originalBoxHeight: number | null
  // 사용자 정의 입력값 (원본과 별개로 유지)
  customWidth: number | null
  customHeight: number | null
  format: string | null
  hasAlpha: boolean | null
  mode: CropMode
}

export function mountCropPage(root: HTMLElement, navigate: (href: string) => void) {
  const state: CropState = {
    file: null,
    originalUrl: null,
    sourceUrl: null,
    width: null,
    height: null,
    originalWidth: null,
    originalHeight: null,
    sourceWidth: null,
    sourceHeight: null,
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
    // 기존 표시용 URL 정리
    revokeUrl(state.originalUrl)
    // 최초 원본 URL은 유지
    const objectUrl = URL.createObjectURL(file)
    state.file = file
    state.originalUrl = objectUrl
    state.sourceUrl = objectUrl
    state.width = null
    state.height = null
    state.originalWidth = null
    state.originalHeight = null
    state.sourceWidth = null
    state.sourceHeight = null
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
      state.sourceWidth = img.width
      state.sourceHeight = img.height
      // 초기 적용 크기 = 원본 전체
      state.width = img.width
      state.height = img.height
      // 원본 비율 유지 박스, 사용자 정의 박스 모두 원본으로 시작
      state.originalBoxWidth = img.width
      state.originalBoxHeight = img.height
      // 사용자 정의 기본값도 원본으로 시작
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
      ${renderHeader('crop')}
      <div class="container">
        <header class="header">
          <div class="header-inner">
            <div class="header-title">
              <h1>크롭</h1>
              <p class="subtitle">이미지를 올린 뒤, 원하는 영역만 잘라내어 알파를 유지한 채 다운로드할 수 있습니다.</p>
            </div>
          </div>
        </header>

        <div class="upload-zone" id="cropUploadZone">
          <input type="file" id="cropFileInput" accept="image/*,.avif,image/avif" hidden />
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
            <div class="preview-img-wrap crop-preview-wrap">
              ${
                state.originalUrl
                  ? `<img id="cropPreviewImg" src="${state.originalUrl}" alt="크롭 입력" />${
                      state.width && state.height
                        ? `<div id="cropSelection" class="crop-selection"></div>`
                        : ''
                    }`
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
                <h4><label class="mode-label"><input type="radio" name="cropMode" id="cropModeOriginal" ${
                  state.mode === 'original' ? 'checked' : ''
                } /> 원본 비율 유지</label></h4>
                <div class="size-input-row">
                  <div class="size-input-wrap">
                    <input
                      type="number"
                      id="cropOriginalWidth"
                      class="size-input"
                      placeholder="가로"
                      value="${state.originalBoxWidth ?? ''}"
                      ${
                        state.mode === 'original' ? '' : 'disabled'
                      } />
                    <span class="size-input-unit">px</span>
                  </div>
                  <span class="size-input-sep">x</span>
                  <div class="size-input-wrap">
                    <input
                      type="number"
                      id="cropOriginalHeight"
                      class="size-input"
                      placeholder="세로"
                      value="${state.originalBoxHeight ?? ''}"
                      ${
                        state.mode === 'original' ? '' : 'disabled'
                      } />
                    <span class="size-input-unit">px</span>
                  </div>
                </div>
              </div>
              <div class="img-info-section">
                <h4><label class="mode-label"><input type="radio" name="cropMode" id="cropModeCustom" ${
                  state.mode === 'custom' ? 'checked' : ''
                } /> 사용자 정의</label></h4>
                <div class="size-input-row">
                  <div class="size-input-wrap">
                    <input
                      type="number"
                      id="cropCustomWidth"
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
                      id="cropCustomHeight"
                      class="size-input"
                      placeholder="세로"
                      value="${state.customHeight ?? ''}"
                      ${
                      state.mode === 'custom' ? '' : 'disabled'
                    } />
                    <span class="size-input-unit">px</span>
                  </div>
                </div>
                <div class="actions top" style="margin-top: 0.75rem;">
                  <button type="button" class="btn btn-primary" id="cropResetButton">초기화</button>
                  <button type="button" class="btn btn-primary" id="cropApplyButton">크롭 적용</button>
                </div>
                <p class="img-note" style="margin-top: 0.5rem; margin-bottom: 0; text-align: left;">※ 크롭 적용 후 다운로드 해주세요.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="actions top" id="cropDownloadRow" style="${state.originalUrl ? '' : 'display:none'}">
          <button type="button" class="btn btn-primary" id="cropDownloadOriginal">원본 포맷 다운로드</button>
          <button type="button" class="btn btn-primary" id="cropDownloadPng">PNG 다운로드</button>
          <button type="button" class="btn btn-primary" id="cropDownloadBmp">BMP 다운로드</button>
        </div>
        <p class="img-note" style="${state.originalUrl ? '' : 'display:none'}">
          ※ 포맷이 PNG 또는 BMP일 경우, 알파가 있으면 그대로 유지됩니다.
        </p>
      </div>
    `

    bindHeaderNavigation(root, navigate)

    const uploadZone = document.getElementById('cropUploadZone')!
    const fileInput = document.getElementById('cropFileInput') as HTMLInputElement
    const downloadOriginalBtn = document.getElementById('cropDownloadOriginal')
    const downloadPngBtn = document.getElementById('cropDownloadPng')
    const downloadBmpBtn = document.getElementById('cropDownloadBmp')

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

    const modeOriginal = document.getElementById('cropModeOriginal') as HTMLInputElement | null
    const modeCustom = document.getElementById('cropModeCustom') as HTMLInputElement | null
    const originalWidthInput = document.getElementById('cropOriginalWidth') as HTMLInputElement | null
    const originalHeightInput = document.getElementById('cropOriginalHeight') as HTMLInputElement | null
    const customWidthInput = document.getElementById('cropCustomWidth') as HTMLInputElement | null
    const customHeightInput = document.getElementById('cropCustomHeight') as HTMLInputElement | null
    const resetButton = document.getElementById('cropResetButton') as HTMLButtonElement | null
    const applyButton = document.getElementById('cropApplyButton') as HTMLButtonElement | null

    const previewImg = document.getElementById('cropPreviewImg') as HTMLImageElement | null
    const selection = document.getElementById('cropSelection') as HTMLDivElement | null

    function updateSelectionRect() {
      if (!previewImg || !selection || !state.originalWidth || !state.originalHeight || !state.width || !state.height) {
        return
      }
      const displayW = previewImg.clientWidth
      const displayH = previewImg.clientHeight
      if (!displayW || !displayH) return

      const scaleX = displayW / state.originalWidth
      const scaleY = displayH / state.originalHeight
      const selW = Math.min(displayW, state.width * scaleX)
      const selH = Math.min(displayH, state.height * scaleY)

      const left = Math.max(0, (displayW - selW) / 2)
      const top = Math.max(0, (displayH - selH) / 2)

      selection.style.width = `${selW}px`
      selection.style.height = `${selH}px`
      selection.style.left = `${left}px`
      selection.style.top = `${top}px`
    }

    if (previewImg) {
      previewImg.addEventListener('load', () => {
        updateSelectionRect()
      })
    }
    updateSelectionRect()

    // 드래그로 선택 영역 이동
    if (selection && previewImg) {
      let dragging = false
      let startX = 0
      let startY = 0
      let startLeft = 0
      let startTop = 0

      const onMouseMove = (e: MouseEvent) => {
        if (!dragging) return
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        const displayW = previewImg.clientWidth
        const displayH = previewImg.clientHeight
        const selW = selection.offsetWidth
        const selH = selection.offsetHeight

        let newLeft = startLeft + dx
        let newTop = startTop + dy

        newLeft = Math.max(0, Math.min(newLeft, displayW - selW))
        newTop = Math.max(0, Math.min(newTop, displayH - selH))

        selection.style.left = `${newLeft}px`
        selection.style.top = `${newTop}px`
      }

      const onMouseUp = () => {
        dragging = false
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      selection.addEventListener('mousedown', (e) => {
        e.preventDefault()
        dragging = true
        startX = e.clientX
        startY = e.clientY
        const rect = selection.getBoundingClientRect()
        const parentRect = previewImg.getBoundingClientRect()
        startLeft = rect.left - parentRect.left
        startTop = rect.top - parentRect.top
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
      })
    }

    modeOriginal?.addEventListener('change', () => {
      if (!modeOriginal.checked) return
      state.mode = 'original'
      // 원본 비율 모드로 돌아올 때는 원본 비율 박스 값으로 적용 크기 설정
      if (state.originalBoxWidth && state.originalBoxHeight) {
        state.width = state.originalBoxWidth
        state.height = state.originalBoxHeight
      }
      render()
    })
    modeCustom?.addEventListener('change', () => {
      if (modeCustom.checked) {
        state.mode = 'custom'
        // 사용자 정의 모드로 들어올 때, 값이 비어 있으면 현재 적용 크기를 기본으로
        if (state.width && state.height && state.customWidth == null && state.customHeight == null) {
          state.customWidth = state.width
          state.customHeight = state.height
        }
        // 사용자 정의 값이 있으면 그걸 적용 크기로 사용
        if (state.customWidth && state.customHeight) {
          state.width = state.customWidth
          state.height = state.customHeight
        }
        render()
      }
    })

    originalWidthInput?.addEventListener('change', () => {
      if (!state.originalWidth || !state.originalHeight) return
      const v = Number(originalWidthInput.value)
      if (!Number.isFinite(v) || v <= 0) return
      const ratio = state.originalHeight / state.originalWidth
      const newH = Math.round(v * ratio)
      // 원본 비율 박스 값만 수정
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
      // 원본 비율 박스 값만 수정
      state.originalBoxHeight = v
      state.originalBoxWidth = newW
      // 이 모드일 때만 실제 적용 크기로 반영
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

    resetButton?.addEventListener('click', () => {
      if (!state.sourceUrl || !state.sourceWidth || !state.sourceHeight) return
      // 화면에 보이는 이미지를 최초 원본으로 되돌림
      state.originalUrl = state.sourceUrl
      state.originalWidth = state.sourceWidth
      state.originalHeight = state.sourceHeight
      // 전체 원본 크기로 되돌리고, 모드는 원본 비율 유지로
      state.mode = 'original'
      state.width = state.sourceWidth
      state.height = state.sourceHeight
      // 원본 비율 유지 / 사용자 정의 px 박스 모두 최초 업로드 이미지 크기로
      state.originalBoxWidth = state.sourceWidth
      state.originalBoxHeight = state.sourceHeight
      state.customWidth = state.sourceWidth
      state.customHeight = state.sourceHeight
      render()
    })

    applyButton?.addEventListener('click', () => {
      if (!previewImg || !selection || !state.originalUrl || !state.originalWidth || !state.originalHeight) return

      const displayW = previewImg.clientWidth
      const displayH = previewImg.clientHeight
      if (!displayW || !displayH) return

      const selRect = selection.getBoundingClientRect()
      const imgRect = previewImg.getBoundingClientRect()

      const selLeft = selRect.left - imgRect.left
      const selTop = selRect.top - imgRect.top
      const selW = selection.offsetWidth
      const selH = selection.offsetHeight

      const scaleX = state.originalWidth / displayW
      const scaleY = state.originalHeight / displayH

      const srcX = Math.max(0, Math.round(selLeft * scaleX))
      const srcY = Math.max(0, Math.round(selTop * scaleY))
      const srcW = Math.max(1, Math.round(selW * scaleX))
      const srcH = Math.max(1, Math.round(selH * scaleY))

      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = srcW
        canvas.height = srcH
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (!blob) return
          const croppedUrl = URL.createObjectURL(blob)
          // 이전 "표시용" URL만 정리 (최초 원본 URL은 유지)
          if (state.originalUrl && state.originalUrl !== state.sourceUrl) {
            URL.revokeObjectURL(state.originalUrl)
          }
          state.originalUrl = croppedUrl
          state.originalWidth = srcW
          state.originalHeight = srcH
          state.width = srcW
          state.height = srcH
          // 사용자 정의 값도 현재 크기로 동기화
          state.customWidth = srcW
          state.customHeight = srcH
          render()
        })
      }
      img.src = state.originalUrl
    })

    downloadOriginalBtn?.addEventListener('click', () => {
      if (!state.originalUrl || !state.file || !state.originalWidth || !state.originalHeight) return
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
        canvas.width = state.originalWidth!
        canvas.height = state.originalHeight!
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
            a.download = `${base}_crop${ext}`
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
      if (!state.file) return
      const name = state.file.name || 'image'
      const base = name.lastIndexOf('.') >= 0 ? name.slice(0, name.lastIndexOf('.')) : name
      const a = document.createElement('a')
      a.href = state.originalUrl!
      a.download = `${base}_crop.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    })

    downloadBmpBtn?.addEventListener('click', () => {
      if (!state.file) return
      const name = state.file.name || 'image'
      const base = name.lastIndexOf('.') >= 0 ? name.slice(0, name.lastIndexOf('.')) : name
      const a = document.createElement('a')
      a.href = state.originalUrl!
      a.download = `${base}_crop.bmp`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    })
  }

  render()
}

