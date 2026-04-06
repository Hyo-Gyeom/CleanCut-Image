# Backend Execution Guide

## Setup & Running

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Download model checkpoint**:
   ```bash
   python download_model.py
   ```

3. **Start the server**:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

- Default URL: `http://localhost:8000`
- Health check: `http://localhost:8000/health`

