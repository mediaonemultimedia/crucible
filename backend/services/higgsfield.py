import httpx
import os
import asyncio

BASE_URL = "https://api.higgsfield.ai/v1"

def _headers():
    return {
        "Authorization": f"Bearer {os.getenv('HIGGSFIELD_API_KEY')}",
        "Content-Type": "application/json",
    }


async def generate_image(prompt: str, negative_prompt: str = "", width: int = 1024, height: int = 1024,
                         reference_image_url: str = None, model: str = "flux-1.1-pro") -> dict:
    payload = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "width": width,
        "height": height,
        "model": model,
    }
    if reference_image_url:
        payload["reference_image_url"] = reference_image_url

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{BASE_URL}/images/generate", headers=_headers(), json=payload)
        r.raise_for_status()
        return r.json()


async def generate_video(prompt: str, negative_prompt: str = "", image_url: str = None,
                         video_url: str = None, duration: int = 5, model: str = "seedance-1-pro",
                         character_id: str = None) -> dict:
    payload = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "duration": duration,
        "model": model,
    }
    if image_url:
        payload["image_url"] = image_url
    if video_url:
        payload["video_url"] = video_url
    if character_id:
        payload["character_id"] = character_id

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{BASE_URL}/videos/generate", headers=_headers(), json=payload)
        r.raise_for_status()
        return r.json()


async def create_character(name: str, reference_image_urls: list[str]) -> dict:
    payload = {"name": name, "reference_images": reference_image_urls}
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{BASE_URL}/characters", headers=_headers(), json=payload)
        r.raise_for_status()
        return r.json()


async def get_generation_status(generation_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{BASE_URL}/generations/{generation_id}", headers=_headers())
        r.raise_for_status()
        return r.json()


async def list_characters() -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{BASE_URL}/characters", headers=_headers())
        r.raise_for_status()
        return r.json().get("characters", [])


async def upscale_video(video_id: str, provider: str = "topaz", resolution: str = "1080p",
                         aspect_ratio: str = "auto", preset: str = "common",
                         width: int = 1920, height: int = 1080, fps: int = 24) -> dict:
    if provider == "topaz":
        payload = {"video_id": video_id, "provider": "topaz", "resolution": resolution, "aspect_ratio": aspect_ratio}
    else:
        payload = {"video_id": video_id, "provider": "bytedance", "resolution": resolution,
                   "preset": preset, "width": width, "height": height, "fps": fps}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{BASE_URL}/videos/upscale", headers=_headers(), json=payload)
        r.raise_for_status()
        return r.json()


async def motion_transfer(image_id: str, motion_video_id: str,
                           resolution: str = "720p", scene_control: str = "image") -> dict:
    payload = {"image_id": image_id, "motion_video_id": motion_video_id,
               "resolution": resolution, "scene_control": scene_control}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{BASE_URL}/videos/motion-control", headers=_headers(), json=payload)
        r.raise_for_status()
        return r.json()


async def poll_until_complete(generation_id: str, interval: int = 3, max_attempts: int = 100) -> dict:
    for _ in range(max_attempts):
        status = await get_generation_status(generation_id)
        if status.get("status") in ("completed", "failed", "error"):
            return status
        await asyncio.sleep(interval)
    raise TimeoutError(f"Generation {generation_id} did not complete in time")
