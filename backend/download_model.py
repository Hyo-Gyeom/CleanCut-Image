"""InSPyReNet base 모델을 backend/models/ 에 다운로드합니다."""
import os
import sys

MODEL_URL = "https://github.com/plemeri/transparent-background/releases/download/1.2.12/ckpt_base.pth"
CKPT_NAME = "ckpt_base.pth"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(SCRIPT_DIR, "models")
TARGET = os.path.join(MODEL_DIR, CKPT_NAME)


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)
    if os.path.isfile(TARGET):
        print(f"이미 존재함: {TARGET}")
        return

    try:
        import wget
        print(f"다운로드 중: {MODEL_URL}")
        wget.download(MODEL_URL, TARGET)
        print(f"\n저장됨: {TARGET}")
    except Exception as e:
        print(f"오류: {e}", file=sys.stderr)
        print("수동 다운로드: ", MODEL_URL, file=sys.stderr)
        print(f"저장 경로: {TARGET}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
