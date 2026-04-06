"""
배경 제거 API — InSPyReNet (transparent-background, MIT 라이선스, 상업용 가능)
POST /remove-bg → 이미지 파일 → 투명 PNG 반환
"""
import io
import os
from datetime import datetime

from fastapi import FastAPI, File, Request, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
import pillow_avif  # noqa: F401 - AVIF 읽기 지원
from PIL import Image

MODEL_NAME = "InSPyReNet"

app = FastAPI(title=f"배경 제거 API ({MODEL_NAME})", version="1.0.0")


@app.on_event("startup")
def startup() -> None:
  import sys

  print(f"[{MODEL_NAME}] 서버 시작 (포트 확인)", flush=True)
  sys.stdout.flush()
  sys.stderr.flush()


app.add_middleware(
  CORSMiddleware,
  allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
  expose_headers=["*"],
)

_remover = None

# 백엔드 경로 안의 models 폴더에서 모델 로드 (없으면 transparent_background 기본 경로 사용)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BACKEND_DIR, "models")
CKPT_BASE = os.path.join(MODEL_DIR, "ckpt_base.pth")


def _get_remover():
  global _remover
  if _remover is not None:
    return _remover

  from transparent_background import Remover

  # backend/models/ckpt_base.pth 가 있으면 그걸 사용, 없으면 기본(다운로드) 경로
  ckpt = CKPT_BASE if os.path.isfile(CKPT_BASE) else None
  _remover = Remover(mode="base", resize="static", ckpt=ckpt)
  return _remover


@app.get("/health")
def health():
  try:
    from transparent_background import Remover  # noqa: F401

    backend = "ready"
  except Exception as e:  # pragma: no cover - 런타임 확인용
    backend = f"error: {type(e).__name__}"
  return {"status": "ok", "model": MODEL_NAME, "backend": backend}


ALPHA_DAILY_TOTAL_LIMIT = 100
ALPHA_PER_IP_LIMIT = 5


def _client_ip(request: Request) -> str:
  forwarded = request.headers.get("x-forwarded-for")
  if forwarded:
    return forwarded.split(",")[0].strip()
  if request.client:
    return request.client.host or "unknown"
  return "unknown"


def _ip_folder(ip_raw: str) -> str:
  return ip_raw.replace(":", "_").replace(".", "_")


def _count_files_in_date_dir(date_dir: str) -> int:
  """해당 날짜 폴더 아래 모든 IP 하위 폴더의 파일 개수 합계."""
  if not os.path.isdir(date_dir):
    return 0
  total = 0
  try:
    for name in os.listdir(date_dir):
      sub = os.path.join(date_dir, name)
      if not os.path.isdir(sub):
        continue
      for f in os.listdir(sub):
        if os.path.isfile(os.path.join(sub, f)):
          total += 1
  except OSError:
    return 0
  return total


def _count_files_ip_today(date_dir: str, ip_folder: str) -> int:
  target = os.path.join(date_dir, ip_folder)
  if not os.path.isdir(target):
    return 0
  try:
    return sum(
      1 for f in os.listdir(target)
      if os.path.isfile(os.path.join(target, f))
    )
  except OSError:
    return 0


@app.post("/remove-bg")
async def remove_bg(request: Request, file: UploadFile = File(...)):
  if not file.content_type or not file.content_type.startswith("image/"):
    raise HTTPException(400, "이미지 파일만 업로드 가능합니다.")

  now = datetime.now()
  date_str = now.strftime("%Y%m%d")
  base_dir = os.path.join(os.path.dirname(__file__), "uploads")
  date_dir = os.path.join(base_dir, date_str)

  if _count_files_in_date_dir(date_dir) >= ALPHA_DAILY_TOTAL_LIMIT:
    return JSONResponse(
      status_code=429,
      content={"detail": f"금일 할당량 {ALPHA_DAILY_TOTAL_LIMIT}장 초과"},
    )

  ip_raw = _client_ip(request)
  ip_folder = _ip_folder(ip_raw)
  if _count_files_ip_today(date_dir, ip_folder) >= ALPHA_PER_IP_LIMIT:
    return JSONResponse(
      status_code=429,
      content={"detail": f"일일 사용자 할당량 {ALPHA_PER_IP_LIMIT}장 초과"},
    )

  try:
    body = await file.read()
    # 1) 업로드 이미지를 "년월일/IP" 폴더 구조로 저장
    #    예: backend/uploads/20260302/192_168_1_1/HHMMSSffffff_원본이름.png
    time_str = now.strftime("%H%M%S%f")

    target_dir = os.path.join(date_dir, ip_folder)
    os.makedirs(target_dir, exist_ok=True)

    orig_name = file.filename or "image"
    name_root, name_ext = os.path.splitext(orig_name)
    if not name_ext:
      name_ext = ".png"
    safe_root = name_root.replace(os.sep, "_").replace("..", "_")
    save_name = f"{time_str}_{safe_root}{name_ext}"
    save_path = os.path.join(target_dir, save_name)

    with open(save_path, "wb") as f:
      f.write(body)

    # 확장자/Content-Type으로 형식 힌트 지정 (AVIF 등 인식)
    fmt = None
    ct = (file.content_type or "").lower()
    ext = (name_ext or "").lower()
    if "avif" in ct or ext == ".avif":
      fmt = "AVIF"
    elif "webp" in ct or ext == ".webp":
      fmt = "WEBP"
    elif "heic" in ct or ext in (".heic", ".heif"):
      fmt = "HEIC"

    bio = io.BytesIO(body)
    try:
      image = Image.open(bio, format=fmt).convert("RGB")
    except Exception:
      bio.seek(0)
      image = Image.open(bio).convert("RGB")
  except Exception as e:
    raise HTTPException(400, f"이미지 읽기 실패: {e}")

  try:
    remover = _get_remover()
    out = remover.process(image, type="rgba")
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.getvalue(), media_type="image/png")
  except Exception as e:  # pragma: no cover - 서버 런타임 디버그용
    import traceback

    traceback.print_exc()
    raise HTTPException(500, f"배경 제거 실패: {e}")
