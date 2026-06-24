import anthropic
import json
import os

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

HIGGSFIELD_MCP_URL = "https://mcp.higgsfield.ai/mcp"

MCP_SERVERS = [
    {"type": "url", "name": "higgsfield", "url": HIGGSFIELD_MCP_URL}
]

ORCHESTRATOR_SYSTEM = """You are a media generation orchestrator. You have access to Higgsfield tools via MCP.
When asked to generate images, videos, upscale, create characters, or transfer motion, use the appropriate Higgsfield tool.
Return ONLY a JSON object with the result — no explanations, no markdown fences.
If the tool returns a generation ID or job ID, include it as "generation_id" in your response.
If the tool returns a URL, include it as "output_url".
Include the "status" field from the tool response.
Always return valid JSON only."""


async def _call_with_mcp(task_prompt: str, max_tokens: int = 4096) -> dict:
    response = client.beta.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        betas=["mcp-client-2025-11-20"],
        mcp_servers=MCP_SERVERS,
        system=ORCHESTRATOR_SYSTEM,
        messages=[{"role": "user", "content": task_prompt}],
    )

    for block in response.content:
        if block.type == "text":
            text = block.text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"status": "completed", "raw_response": text}
        elif block.type == "mcp_tool_result":
            if hasattr(block, 'content') and block.content:
                for item in block.content:
                    if hasattr(item, 'text'):
                        try:
                            return json.loads(item.text)
                        except json.JSONDecodeError:
                            return {"status": "completed", "raw_response": item.text}

    return {"status": "error", "message": "No usable response from MCP tools"}


async def generate_image(prompt: str, negative_prompt: str = "", width: int = 1024, height: int = 1024,
                         reference_image_url: str = None, model: str = "flux-1.1-pro") -> dict:
    parts = [f"Generate an image using the Higgsfield generate_image tool with these parameters:"]
    parts.append(f"- prompt: {prompt}")
    if negative_prompt:
        parts.append(f"- negative_prompt: {negative_prompt}")
    parts.append(f"- width: {width}")
    parts.append(f"- height: {height}")
    parts.append(f"- model: {model}")
    if reference_image_url:
        parts.append(f"- reference_image_url: {reference_image_url}")
    return await _call_with_mcp("\n".join(parts))


async def generate_video(prompt: str, negative_prompt: str = "", image_url: str = None,
                         video_url: str = None, duration: int = 5, model: str = "seedance-1-pro",
                         character_id: str = None) -> dict:
    parts = [f"Generate a video using the Higgsfield generate_video tool with these parameters:"]
    parts.append(f"- prompt: {prompt}")
    if negative_prompt:
        parts.append(f"- negative_prompt: {negative_prompt}")
    parts.append(f"- duration: {duration}")
    parts.append(f"- model: {model}")
    if image_url:
        parts.append(f"- image_url: {image_url}")
    if video_url:
        parts.append(f"- video_url: {video_url}")
    if character_id:
        parts.append(f"- character_id: {character_id}")
    return await _call_with_mcp("\n".join(parts))


async def create_character(name: str, reference_image_urls: list[str]) -> dict:
    urls_str = ", ".join(reference_image_urls)
    return await _call_with_mcp(
        f"Create a character using the Higgsfield character creation tool.\n"
        f"- name: {name}\n"
        f"- reference_image_urls: [{urls_str}]"
    )


async def get_generation_status(generation_id: str) -> dict:
    return await _call_with_mcp(
        f"Check the status of Higgsfield generation with ID: {generation_id}"
    )


async def list_characters() -> list[dict]:
    result = await _call_with_mcp("List all available Higgsfield characters.")
    if isinstance(result, list):
        return result
    return result.get("characters", [])


async def upscale_video(video_id: str, provider: str = "topaz", resolution: str = "1080p",
                         aspect_ratio: str = "auto", preset: str = "common",
                         width: int = 1920, height: int = 1080, fps: int = 24) -> dict:
    parts = [f"Upscale a video using the Higgsfield upscale tool with these parameters:"]
    parts.append(f"- video_id: {video_id}")
    parts.append(f"- provider: {provider}")
    parts.append(f"- resolution: {resolution}")
    if provider == "topaz":
        parts.append(f"- aspect_ratio: {aspect_ratio}")
    else:
        parts.append(f"- preset: {preset}")
        parts.append(f"- width: {width}")
        parts.append(f"- height: {height}")
        parts.append(f"- fps: {fps}")
    return await _call_with_mcp("\n".join(parts))


async def motion_transfer(image_id: str, motion_video_id: str,
                           resolution: str = "720p", scene_control: str = "image") -> dict:
    return await _call_with_mcp(
        f"Transfer motion using the Higgsfield motion control tool.\n"
        f"- image_id: {image_id}\n"
        f"- motion_video_id: {motion_video_id}\n"
        f"- resolution: {resolution}\n"
        f"- scene_control: {scene_control}"
    )


async def poll_until_complete(generation_id: str, interval: int = 3, max_attempts: int = 100) -> dict:
    import asyncio
    for _ in range(max_attempts):
        status = await get_generation_status(generation_id)
        if status.get("status") in ("completed", "failed", "error"):
            return status
        await asyncio.sleep(interval)
    raise TimeoutError(f"Generation {generation_id} did not complete in time")
