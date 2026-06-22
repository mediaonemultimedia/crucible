import anthropic
import base64
import os
from pathlib import Path

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

PROMPT_ENHANCEMENT_SYSTEM = """You are an expert AI video and image prompt engineer.
When given a user's rough prompt and context about what they want to achieve,
you return a single optimized prompt string — no explanations, no markdown, just the prompt.

Follow these best practices:
- Lead with the subject and primary action
- Add camera/lens details for video (e.g. "shot on 35mm, shallow depth of field")
- Include lighting conditions (golden hour, studio softbox, overcast diffused)
- Specify motion style for video (slow push-in, static locked-off, handheld verité)
- End with style/mood keywords (cinematic, photorealistic, 8K, film grain)
- Keep under 200 tokens — models perform worse with bloated prompts
- Never include negative prompts inline — those go in the negative field separately"""

SUBJECT_DETECTION_SYSTEM = """You are a computer vision assistant analyzing video frames or images.
Identify all distinct subjects (people, objects of interest) in the provided image.
Return a JSON array of subjects, each with:
  - id: short slug (e.g. "person_1", "jacket_red")
  - label: human-readable label
  - description: 1-sentence visual description
  - position: rough position ("left", "center", "right", "background", "foreground")
  - type: "person" | "object" | "animal" | "background"
Return only valid JSON, no markdown fences."""


async def enhance_prompt(raw_prompt: str, node_type: str, context: dict) -> str:
    context_str = "\n".join(f"- {k}: {v}" for k, v in context.items() if v)
    camera_note = ""
    if context.get("camera_prompt"):
        camera_note = f"\nCamera movement already specified (preserve this exactly): {context['camera_prompt']}"
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        system=PROMPT_ENHANCEMENT_SYSTEM,
        messages=[{
            "role": "user",
            "content": f"Node type: {node_type}\nContext:\n{context_str}{camera_note}\n\nUser's prompt: {raw_prompt}\n\nReturn the optimized prompt:"
        }]
    )
    return message.content[0].text.strip()


async def detect_subjects(image_path: str) -> list[dict]:
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    ext = Path(image_path).suffix.lower()
    media_type_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    media_type = media_type_map.get(ext, "image/jpeg")

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SUBJECT_DETECTION_SYSTEM,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_data}},
                {"type": "text", "text": "Identify all subjects in this image. Return JSON array only."}
            ]
        }]
    )

    import json
    raw = message.content[0].text.strip()
    return json.loads(raw)


async def build_spatial_prompt(region_descriptions: str, base_prompt: str = "") -> str:
    system = """You are an expert AI video prompt engineer specializing in spatial composition.
Given a list of annotated regions in a video frame (each with a label, position, size, and instruction),
write a single cohesive video generation prompt that naturally describes all the requested changes
as if describing a scene to a cinematographer.

Rules:
- Integrate all regions naturally into one flowing description — do not list them as bullet points
- Use spatial language: "in his right hand", "around her wrist", "on the table in the foreground"
- Reference object interactions with natural verbs: holding, gripping, wearing, carrying, resting on
- Preserve the overall scene — only describe what changes, keeping everything else identical
- End with: "all other elements of the scene remain unchanged"
- Keep under 180 tokens
- Return only the prompt, no explanations"""

    base_note = f"\nOverall scene context: {base_prompt}" if base_prompt else ""
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=250,
        system=system,
        messages=[{
            "role": "user",
            "content": f"Annotated regions:{base_note}\n{region_descriptions}\n\nWrite the spatial video prompt:"
        }]
    )
    return message.content[0].text.strip()


async def suggest_node_prompt(node_type: str, connected_outputs: list[dict]) -> str:
    """Given what's feeding into a node, suggest a starting prompt."""
    context = "\n".join(f"- {o['label']}: {o['description']}" for o in connected_outputs)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"I'm building a {node_type} node. The following are connected as inputs:\n{context}\n\nSuggest a concise starting prompt for this node that makes good use of these inputs. Return only the prompt text."
        }]
    )
    return message.content[0].text.strip()
