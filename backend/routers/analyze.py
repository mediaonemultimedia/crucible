import os
import shutil
import subprocess
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from services import claude

router = APIRouter(prefix="/analyze", tags=["analyze"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix
    filename = f"{uuid.uuid4()}{ext}"
    dest = UPLOAD_DIR / filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"file_id": filename, "url": f"/uploads/{filename}", "original_name": file.filename}


@router.post("/subjects/{file_id}")
async def detect_subjects(file_id: str):
    path = UPLOAD_DIR / file_id
    if not path.exists():
        raise HTTPException(404, "File not found")
    subjects = await claude.detect_subjects(str(path))
    return {"subjects": subjects, "file_id": file_id}


class EnhanceRequest(BaseModel):
    prompt: str
    node_type: str
    context: dict = {}


@router.post("/enhance-prompt")
async def enhance_prompt(req: EnhanceRequest):
    enhanced = await claude.enhance_prompt(req.prompt, req.node_type, req.context)
    return {"original": req.prompt, "enhanced": enhanced}


class SuggestRequest(BaseModel):
    node_type: str
    connected_outputs: list[dict] = []


class FrameExtractRequest(BaseModel):
    video_url: str   # /uploads/xxx.mp4 relative URL or absolute local path
    timestamp: float = 0.0


class SpatialPromptRequest(BaseModel):
    regions: str          # pre-formatted region descriptions
    base_prompt: str = ""


@router.post("/suggest-prompt")
async def suggest_prompt(req: SuggestRequest):
    suggestion = await claude.suggest_node_prompt(req.node_type, req.connected_outputs)
    return {"suggestion": suggestion}


@router.post("/extract-frame")
async def extract_frame(req: FrameExtractRequest):
    # Resolve video path from URL
    if req.video_url.startswith("/uploads/"):
        video_path = UPLOAD_DIR / req.video_url.replace("/uploads/", "")
    else:
        video_path = Path(req.video_url)
    if not video_path.exists():
        raise HTTPException(404, "Video file not found")

    frame_id = f"{uuid.uuid4()}.jpg"
    frame_path = UPLOAD_DIR / frame_id

    try:
        subprocess.run([
            "ffmpeg", "-ss", str(req.timestamp), "-i", str(video_path),
            "-vframes", "1", "-q:v", "2", str(frame_path), "-y"
        ], check=True, capture_output=True)
    except FileNotFoundError:
        # ffmpeg not installed yet — serve a placeholder response
        raise HTTPException(503, "ffmpeg not available. Install with: brew install ffmpeg")
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"Frame extraction failed: {e.stderr.decode()}")

    return {"file_id": frame_id, "url": f"/uploads/{frame_id}"}


@router.post("/spatial-prompt")
async def build_spatial_prompt(req: SpatialPromptRequest):
    prompt = await claude.build_spatial_prompt(req.regions, req.base_prompt)
    return {"prompt": prompt}
