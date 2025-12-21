import os
import sys
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from services.youtube import get_transcript
from services.ai_engine import analyze_structure, generate_script


def get_config_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def get_static_dir() -> Path:
    if getattr(sys, "_MEIPASS", None):
        return Path(sys._MEIPASS) / "static"
    return Path(__file__).resolve().parent / "static"


CONFIG_DIR = get_config_dir()
STATIC_DIR = get_static_dir()
ENV_PATH = CONFIG_DIR / ".env"
load_dotenv(ENV_PATH)

app = FastAPI(title="YouTube Pattern Benchmark", docs_url=None, redoc_url=None)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# 간단한 메모리 캐시: 동일 URL은 같은 분석 결과를 반환
ANALYSIS_CACHE: Dict[str, Any] = {}


class AnalyzeRequest(BaseModel):
    url: str
    api_key: Optional[str] = None


class GenerateRequest(BaseModel):
    topic: str
    analysis: Dict[str, Any]
    tone: Optional[str] = None
    style: Optional[str] = None
    audience: Optional[str] = None
    api_key: Optional[str] = None


class SaveKeyRequest(BaseModel):
    api_key: str


def set_api_key(api_key: Optional[str]):
    if api_key:
        os.environ["GOOGLE_API_KEY"] = api_key


def persist_api_key(api_key: str):
    lines = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    updated = False
    for idx, line in enumerate(lines):
        if line.startswith("GOOGLE_API_KEY="):
            lines[idx] = f"GOOGLE_API_KEY={api_key}"
            updated = True
            break
    if not updated:
        lines.append(f"GOOGLE_API_KEY={api_key}")
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.environ["GOOGLE_API_KEY"] = api_key


@app.get("/")
def root():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/analyze")
def api_analyze(payload: AnalyzeRequest):
    set_api_key(payload.api_key)
    if not payload.url:
        raise HTTPException(status_code=400, detail="URL is required")

    if payload.url in ANALYSIS_CACHE:
        return JSONResponse(ANALYSIS_CACHE[payload.url])

    transcript = get_transcript(payload.url)
    if not transcript:
        raise HTTPException(status_code=400, detail="Failed to fetch transcript.")

    text = transcript.get("text") if isinstance(transcript, dict) else transcript
    duration = transcript.get("duration") if isinstance(transcript, dict) else None
    result = analyze_structure(text, duration_seconds=duration)
    if not result:
        raise HTTPException(status_code=500, detail="Analysis failed.")
    if isinstance(result, dict) and result.get("error"):
        raise HTTPException(status_code=500, detail=f"Analysis failed: {result.get('error')}")

    ANALYSIS_CACHE[payload.url] = result
    return JSONResponse(result)


@app.post("/api/generate")
def api_generate(payload: GenerateRequest):
    set_api_key(payload.api_key)
    if not payload.topic:
        raise HTTPException(status_code=400, detail="Topic is required")
    if not payload.analysis:
        raise HTTPException(status_code=400, detail="Analysis result is required")

    script = generate_script(
        payload.analysis,
        payload.topic,
        payload.tone,
        payload.style,
        payload.audience,
    )
    if not script:
        raise HTTPException(status_code=500, detail="Failed to generate script.")

    return {"script": script}


@app.post("/api/save-key")
def api_save_key(payload: SaveKeyRequest):
    if not payload.api_key:
        raise HTTPException(status_code=400, detail="API key is required")
    try:
        persist_api_key(payload.api_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save key: {e}")
    return {"message": "API key saved to .env and applied to session."}


# 호환용 엔드포인트 (혹시 프런트 경로가 다를 때 대비)
@app.post("/save-key")
def api_save_key_alias(payload: SaveKeyRequest):
    return api_save_key(payload)
