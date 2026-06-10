"""Regex and keyword heuristics over the user's artifact edit-request text.

Classifies request scope (broad vs patch-only vs structural), detects
background/city/image-asset intent, layout orientation, title text and
decoration intent, and requested title colors. Pure text analysis: no
HTML/CSS inspection and no provider calls. Extracted from app.api.ai.
"""

from __future__ import annotations

import re
from typing import Any


TITLE_COLOR_KEYWORDS = (
    "red",
    "orange",
    "yellow",
    "gold",
    "amber",
    "green",
    "teal",
    "cyan",
    "blue",
    "navy",
    "indigo",
    "violet",
    "purple",
    "magenta",
    "pink",
    "brown",
    "beige",
    "white",
    "black",
    "gray",
    "grey",
    "silver",
    "maroon",
    "olive",
    "lime",
    "turquoise",
)

ARTIFACT_BROAD_EDIT_REQUEST_RE = re.compile(
    r"\b(?:redesign|rebuild|start over|from scratch|new concept|completely different|totally different|overhaul|reimagine|replace the scene|brand new)\b",
    re.IGNORECASE,
)

ARTIFACT_PATCH_ONLY_EDIT_REQUEST_RE = re.compile(
    r"\b(?:background|backdrop|sky|track|road|ground|terrain|landscape|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|color|colour|gradient|opacity|shadow|glow|border|radius|font|typography|title|headline|question|label|badge|text|padding|margin|spacing|size|bigger|smaller|larger)\b",
    re.IGNORECASE,
)

ARTIFACT_FEEDBACK_FOLLOWUP_RE = re.compile(
    r"\b(?:nothing changed|no change|still white|still blank|still the same|didn['’]?t work|didnt work|not a city|not a skyline|isn['’]?t a city|isnt a city|too white|too blank|can['’]?t see|cant see|background didn['’]?t change|background didnt change)\b",
    re.IGNORECASE,
)

ARTIFACT_STRUCTURAL_LOCAL_EDIT_REQUEST_RE = re.compile(
    r"\b(?:photo|picture|texture|asset|logo|svg|illustration|swap|convert|turn into|insert|delete|rearrange|reposition|restructure|scene element|track image)\b",
    re.IGNORECASE,
)

# Detects when a seemingly-structural verb ("add", "remove", "replace",
# "image", "layout") is actually targeting a CSS-patchable property.
# When this matches, the structural classification is overridden and the
# request is allowed into the patch pipeline.
ARTIFACT_STRUCTURAL_CSS_OVERRIDE_RE = re.compile(
    r"\b(?:add|remove|replace|change|image|layout)\b[\s\S]{0,40}\b(?:gradient|color|colour|shadow|glow|border|radius|opacity|background|font|padding|margin|spacing|filter|blur|brightness|contrast|saturate|animation|transition|style|effect|theme|tone|hue|tint|shade)\b",
    re.IGNORECASE,
)

ARTIFACT_LAYOUT_ORIENTATION_EDIT_REQUEST_RE = re.compile(
    r"\b(?:align|alignment|horizontal|vertical|column|columns|stack|stacked|orientation|left-align|right-align|center-align|centre-align|side by side|top to bottom|flip to vertical|flip to horizontal)\b",
    re.IGNORECASE,
)

def is_artifact_feedback_followup_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    return bool(ARTIFACT_FEEDBACK_FOLLOWUP_RE.search(normalized))

def resolve_artifact_edit_request_feedback(
    artifact_context: dict[str, Any], request_text: str
) -> str:
    normalized = (request_text or "").strip()
    if not normalized or not is_artifact_feedback_followup_request(normalized):
        return normalized
    recent_requests = (
        artifact_context.get("recentEditRequests")
        if isinstance(artifact_context.get("recentEditRequests"), list)
        else []
    )
    for item in reversed(recent_requests):
        prior_request = item.strip() if isinstance(item, str) else ""
        if (
            not prior_request
            or prior_request == normalized
            or is_artifact_feedback_followup_request(prior_request)
        ):
            continue
        if is_background_visual_edit_request(prior_request):
            return (
                "Retry the previous background-only edit and make the result clearly visible. "
                f"Previous request: {prior_request}. "
                f"User feedback on the last attempt: {normalized}. "
                "Keep the cars, labels, layout, vote visuals, and foreground gameplay art unchanged. "
                "Apply a visibly different background treatment across the full scene. "
                "Do not leave the result pale, blank, nearly white, or barely changed."
            )
        return (
            "Retry the previous targeted edit more faithfully. "
            f"Previous request: {prior_request}. "
            f"User feedback on the last attempt: {normalized}. "
            "Keep unrelated parts of the artifact unchanged."
        )
    return normalized

def is_broad_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    return bool(ARTIFACT_BROAD_EDIT_REQUEST_RE.search(normalized))

def is_layout_orientation_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    return bool(ARTIFACT_LAYOUT_ORIENTATION_EDIT_REQUEST_RE.search(normalized))

def is_title_text_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    return bool(
        re.search(
            r"\b(?:title|headline|question|header|heading|eyebrow|caption|label|labels|text)\b",
            normalized,
            re.IGNORECASE,
        )
    )

def is_title_overlap_spacing_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    has_text_target = is_title_text_artifact_edit_request(normalized)
    has_overlap_signal = bool(
        re.search(
            r"\b(?:hidden|hide|hiding|behind|overlap|overlapping|covered|covering|obscured|blocked|clipped|clip|under)\b",
            normalized,
            re.IGNORECASE,
        )
    )
    return has_text_target and has_overlap_signal

def infer_requested_artifact_layout_orientation(request_text: str) -> str:
    lowered = (request_text or "").strip().lower()
    if not lowered:
        return ""
    if re.search(
        r"horizontal[\s\S]{0,80}(?:become|becomes|turn(?:ed)?|change(?:d)?|convert(?:ed)?|to)\s+vertical",
        lowered,
    ):
        return "vertical"
    if re.search(
        r"vertical[\s\S]{0,80}(?:become|becomes|turn(?:ed)?|change(?:d)?|convert(?:ed)?|to)\s+horizontal",
        lowered,
    ):
        return "horizontal"
    if re.search(
        r"(?:instead of|from)\s+horizontal[\s\S]{0,80}(?:to|into)?\s*vertical",
        lowered,
    ):
        return "vertical"
    if re.search(
        r"(?:instead of|from)\s+vertical[\s\S]{0,80}(?:to|into)?\s*horizontal",
        lowered,
    ):
        return "horizontal"
    vertical_score = 0
    horizontal_score = 0
    if re.search(r"\b(?:vertical|column|columns|stack|stacked|top to bottom)\b", lowered):
        vertical_score += 1
    if re.search(
        r"\b(?:horizontal|row|rows|side by side|left to right)\b", lowered
    ):
        horizontal_score += 1
    if re.search(r"\b(?:rotate|flip|switch|convert|change)\b", lowered):
        vertical_score += 1 if "vertical" in lowered else 0
        horizontal_score += 1 if "horizontal" in lowered else 0
    if "vertical" in lowered and "horizontal" in lowered:
        if lowered.rfind("vertical") > lowered.rfind("horizontal"):
            vertical_score += 1
        elif lowered.rfind("horizontal") > lowered.rfind("vertical"):
            horizontal_score += 1
    if vertical_score > horizontal_score:
        return "vertical"
    if horizontal_score > vertical_score:
        return "horizontal"
    return ""

def is_patch_only_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    if is_background_image_asset_edit_request(normalized):
        return True
    if is_layout_orientation_artifact_edit_request(normalized):
        return True
    if ARTIFACT_STRUCTURAL_LOCAL_EDIT_REQUEST_RE.search(normalized):
        # A structural word was found, but check whether it's actually
        # targeting a CSS property (e.g. "add a gradient", "remove the border").
        if not ARTIFACT_STRUCTURAL_CSS_OVERRIDE_RE.search(normalized):
            return False
    return bool(ARTIFACT_PATCH_ONLY_EDIT_REQUEST_RE.search(normalized))

def classify_artifact_edit_request_scope(request_text: str) -> str:
    normalized = (request_text or "").strip()
    if not normalized:
        return "unknown"
    if is_broad_artifact_edit_request(normalized):
        return "broad"
    if is_patch_only_artifact_edit_request(normalized):
        return "patch_only"
    return "structural_local"

def artifact_edit_request_requires_external_asset_url(request: str) -> bool:
    text = (request or "").strip()
    if not text:
        return False
    lowered = text.lower()
    if re.search(r"\bhttps?://\S+", text, re.IGNORECASE) or "data:image/" in lowered:
        return False
    return bool(
        re.search(
            r"\b(?:background image|image of|photo of|picture of|texture of|logo of|use an image|use a photo|use a picture|replace .* image|swap .* image|background .* image)\b",
            lowered,
        )
    )

def is_background_image_asset_edit_request(request: str) -> bool:
    lowered = (request or "").strip().lower()
    if not lowered:
        return False
    has_background_target = bool(
        re.search(r"\b(?:background|backdrop|sky|scene|track)\b", lowered)
    )
    has_image_target = bool(
        re.search(r"\b(?:image|photo|picture|texture)\b", lowered)
    )
    return has_background_target and has_image_target

def is_background_visual_edit_request(request: str) -> bool:
    return bool(
        re.search(
            r"\b(?:background|backdrop|sky|track|road|ground|terrain|landscape|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|day\b|night\b|city|cityscape|urban|skyline|downtown|buildings?)\b",
            request or "",
            re.IGNORECASE,
        )
    )

def is_city_background_edit_request(request: str) -> bool:
    lowered = (request or "").strip().lower()
    if not lowered:
        return False
    return bool(
        re.search(r"\b(?:city|cityscape|urban|skyline|downtown|buildings?|skyscraper)\b", lowered)
    ) and bool(re.search(r"\b(?:background|backdrop|sky|scene|track)\b", lowered))

def request_explicitly_wraps_title_in_container(request_text: str) -> bool:
    normalized = (request_text or "").strip().lower()
    if not normalized:
        return False
    if re.search(
        r"\b(?:put|place|wrap|enclose|encase)\b[\s\S]{0,60}\b(?:title|headline|question)\b[\s\S]{0,40}\b(?:in|inside|within)\b",
        normalized,
    ):
        return True
    return bool(
        re.search(
            r"\b(?:title|headline|question)\b[\s\S]{0,40}\b(?:in|inside|within)\b[\s\S]{0,50}\b(?:container|box|badge|pill|frame|card|capsule|panel|brick|lego)\b",
            normalized,
        )
    )

def infer_title_decoration_intent(request_text: str) -> tuple[bool, bool]:
    normalized = (request_text or "").strip().lower()
    if not normalized or not is_title_text_artifact_edit_request(normalized):
        return (False, False)
    dense_terms = bool(
        re.search(
            r"\b(?:more|many|extra|fill|filled|across|full|entire|whole|dense|packed|repeat|repeating|row|rows)\b",
            normalized,
        )
    )
    top_terms = bool(re.search(r"\b(?:top|upper|above|header)\b", normalized))
    direct_decoration_terms = bool(
        re.search(
            r"\b(?:stud|studs|decorate|decorative|embellish|ornament|ornaments|motif|motifs|pattern|patterns|icon|icons|symbol|symbols)\b",
            normalized,
        )
    )
    decorative_object_phrase = re.search(
        r"\b(?:add|put|place|overlay)\s+(?P<object>[a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,3})\s+(?:on|onto|to|across|along|over)\b",
        normalized,
    )
    style_terms = re.compile(
        r"\b(?:padding|margin|spacing|gap|radius|border|color|colour|font|size|width|height|alignment|align|position|z-index|background)\b"
    )
    object_is_style_term = bool(
        decorative_object_phrase and style_terms.search(decorative_object_phrase.group("object") or "")
    )
    has_object_decoration_phrase = bool(decorative_object_phrase) and not object_is_style_term
    has_title_decoration_intent = (
        direct_decoration_terms
        or has_object_decoration_phrase
        or (top_terms and dense_terms)
    )
    has_dense_title_decoration_intent = has_title_decoration_intent and (
        dense_terms or (top_terms and "fill" in normalized)
    )
    return (has_title_decoration_intent, has_dense_title_decoration_intent)

def is_title_decoration_only_request(request_text: str) -> bool:
    normalized = (request_text or "").strip().lower()
    if not normalized or not is_title_text_artifact_edit_request(normalized):
        return False
    has_title_decoration_intent, _dense = infer_title_decoration_intent(normalized)
    if not has_title_decoration_intent:
        return False
    if request_explicitly_wraps_title_in_container(normalized):
        return False
    if re.search(
        r"\b(?:add|put|place|overlay|decorate|decorative|embellish)\b",
        normalized,
    ):
        return True
    return False

def extract_title_requested_color_tokens(request_text: str) -> list[str]:
    normalized = (request_text or "").strip().lower()
    if not normalized or not is_title_text_artifact_edit_request(normalized):
        return []
    tokens: list[str] = []
    seen: set[str] = set()

    def remember(token: str) -> None:
        normalized_token = normalize_requested_color_token(token)
        if not normalized_token or normalized_token in seen:
            return
        seen.add(normalized_token)
        tokens.append(normalized_token)

    for hex_color in re.findall(r"#[0-9a-f]{3,8}\b", normalized):
        remember(hex_color)
    for functional_color in re.findall(
        r"\b(?:rgb|rgba|hsl|hsla)\s*\(\s*[^()]{3,80}\)",
        normalized,
    ):
        remember(functional_color)
    for color_keyword in TITLE_COLOR_KEYWORDS:
        if re.search(rf"\b{re.escape(color_keyword)}\b", normalized):
            remember(color_keyword)
    return tokens[:4]

def normalize_requested_color_token(color_token: str) -> str:
    normalized = (color_token or "").strip().lower()
    if not normalized:
        return ""
    if normalized.startswith("#"):
        return normalized
    if re.match(r"^(?:rgb|rgba|hsl|hsla)\s*\(", normalized):
        return re.sub(r"\s+", "", normalized)
    return normalized
