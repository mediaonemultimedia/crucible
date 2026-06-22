from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services import higgsfield, claude

router = APIRouter(prefix="/generate", tags=["generate"])


class ImageGenRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    reference_image_url: Optional[str] = None
    model: str = "flux-1.1-pro"
    enhance_prompt: bool = True
    node_context: dict = {}


class VideoGenRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    duration: int = 5
    model: str = "seedance-1-pro"
    character_id: Optional[str] = None
    enhance_prompt: bool = True
    node_context: dict = {}


class CharacterRequest(BaseModel):
    name: str
    reference_image_urls: list[str]


class UpscaleRequest(BaseModel):
    video_id: str
    provider: str = "topaz"
    resolution: str = "1080p"
    aspect_ratio: str = "auto"
    preset: str = "common"
    width: int = 1920
    height: int = 1080
    fps: int = 24


class MotionTransferRequest(BaseModel):
    image_id: str
    motion_video_id: str
    resolution: str = "720p"
    scene_control: str = "image"


@router.post("/upscale")
async def upscale(req: UpscaleRequest):
    return await higgsfield.upscale_video(
        video_id=req.video_id,
        provider=req.provider,
        resolution=req.resolution,
        aspect_ratio=req.aspect_ratio,
        preset=req.preset,
        width=req.width,
        height=req.height,
        fps=req.fps,
    )


@router.post("/motion-transfer")
async def motion_transfer(req: MotionTransferRequest):
    return await higgsfield.motion_transfer(
        image_id=req.image_id,
        motion_video_id=req.motion_video_id,
        resolution=req.resolution,
        scene_control=req.scene_control,
    )


@router.post("/image")
async def gen_image(req: ImageGenRequest):
    prompt = req.prompt
    if req.enhance_prompt and prompt:
        prompt = await claude.enhance_prompt(prompt, "image_generation", req.node_context)
    result = await higgsfield.generate_image(
        prompt=prompt,
        negative_prompt=req.negative_prompt,
        width=req.width,
        height=req.height,
        reference_image_url=req.reference_image_url,
        model=req.model,
    )
    return {**result, "enhanced_prompt": prompt}


@router.post("/video")
async def gen_video(req: VideoGenRequest):
    prompt = req.prompt
    if req.enhance_prompt and prompt:
        prompt = await claude.enhance_prompt(prompt, "video_generation", req.node_context)
    result = await higgsfield.generate_video(
        prompt=prompt,
        negative_prompt=req.negative_prompt,
        image_url=req.image_url,
        video_url=req.video_url,
        duration=req.duration,
        model=req.model,
        character_id=req.character_id,
    )
    return {**result, "enhanced_prompt": prompt}


@router.post("/character")
async def gen_character(req: CharacterRequest):
    return await higgsfield.create_character(req.name, req.reference_image_urls)


@router.get("/status/{generation_id}")
async def get_status(generation_id: str):
    return await higgsfield.get_generation_status(generation_id)


@router.get("/characters")
async def get_characters():
    return await higgsfield.list_characters()
