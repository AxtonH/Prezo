"""Background-treatment subsystem for artifact HTML.

Infers background intent from request text, normalizes planner-provided
treatment configs (palettes, structure controls), embeds the config in the
artifact HTML, applies/validates treatments, and builds the related prompt
and assistant messaging. Extracted from app.api.ai.
"""

from __future__ import annotations

import json
import re
from typing import Any

from .artifact_css_edit import ARTIFACT_STYLE_TAG_RE, find_matching_delimiter
from .artifact_edit_intent import is_background_visual_edit_request
from .artifact_quality import extract_first_json_object, try_parse_json
from .artifact_selectors import (
    choose_artifact_background_treatment_target_selector,
    choose_scene_root_selector_candidate,
    extract_artifact_background_selector_candidates,
    extract_artifact_background_style_snippets,
    extract_artifact_scene_root_selector_candidates,
)


ARTIFACT_BACKGROUND_TREATMENT_SCRIPT_ID = "prezo-background-treatment-data"

def build_artifact_background_treatment_prompt(
    *,
    original_edit_request: str,
    context: dict[str, Any],
    current_html: str,
) -> str:
    artifact_context = (
        context.get("artifact") if isinstance(context.get("artifact"), dict) else {}
    )
    artifact_type = (
        artifact_context.get("artifactType")
        if isinstance(artifact_context.get("artifactType"), str)
        else ""
    )
    design_guidelines = (
        artifact_context.get("designGuidelines")
        if isinstance(artifact_context.get("designGuidelines"), str)
        else ""
    )
    poll_title = (
        artifact_context.get("pollTitle")
        if isinstance(artifact_context.get("pollTitle"), str)
        else ""
    )
    background_selector_candidates = extract_artifact_background_selector_candidates(
        current_html
    )
    scene_root_selector_candidates = extract_artifact_scene_root_selector_candidates(
        current_html
    )
    background_style_snippets = extract_artifact_background_style_snippets(current_html)
    return "\n".join(
        [
            "<task>",
            "Translate the user request into a structured background-only treatment for the current artifact.",
            "Do not modify cars, labels, gameplay elements, or live hooks.",
            "</task>",
            "<request>",
            original_edit_request,
            "</request>",
            f"<artifact_type>{artifact_type}</artifact_type>" if artifact_type else "",
            (
                f"<design_guidelines>{design_guidelines}</design_guidelines>"
                if design_guidelines
                else ""
            ),
            f"<poll_title>{poll_title}</poll_title>" if poll_title else "",
            (
                "<exact_background_selectors>"
                + ", ".join(background_selector_candidates)
                + "</exact_background_selectors>"
                if background_selector_candidates
                else ""
            ),
            (
                "<exact_scene_root_selectors>"
                + ", ".join(scene_root_selector_candidates)
                + "</exact_scene_root_selectors>"
                if scene_root_selector_candidates
                else ""
            ),
            (
                "<current_background_css>\n"
                + "\n\n".join(background_style_snippets)
                + "\n</current_background_css>"
                if background_style_snippets
                else ""
            ),
            "<quality_bar>",
            "Prefer a meaningful visual composition over a weak color wash.",
            "Never return a pale blank background unless the user explicitly asks for a minimal white background.",
            "Choose a composition that fits the request and can be rendered with CSS only.",
            "Use targetSelector only when one of the exact background selectors above is an obvious fit. Otherwise leave it empty and the backend will choose.",
            "If no dedicated background selector is available, the backend may target a stable scene-root selector instead. Do not invent your own selector names.",
            "For skyline or city requests, use structural controls, not just colors.",
            "If the request asks for more detail, richer buildings, or better skyline detail, return at least layerCount 3, buildingCount 18, heightVariance 45, windowDensity 25, and roofVariation 25.",
            "If the request mentions windows, increase windowDensity to 45 or higher.",
            "If the request mentions spires or antennas, increase spireFrequency to 35 or higher and roofVariation to 45 or higher.",
            "</quality_bar>",
            "<example name=\"detailed_skyline\">",
            '{"assistantMessage":"Apply a night skyline with three depth layers and visible windows.","treatment":{"composition":"skyline","timeOfDay":"night","intensity":"dramatic","topColor":"#173A5C","midColor":"#476C8F","bottomColor":"#D39A63","silhouetteColor":"#122033","accentColor":"#F0B36F","hazeColor":"#6E88A3","lightColor":"#FFE1A0","horizonHeightPct":44,"detailDensity":78,"layerCount":4,"buildingCount":24,"heightVariance":70,"windowDensity":58,"spireFrequency":36,"roofVariation":54,"targetSelector":""}}',
            "</example>",
            "<example name=\"sunset_gradient\">",
            '{"assistantMessage":"Apply a layered sunset atmosphere.","treatment":{"composition":"abstract","timeOfDay":"sunset","intensity":"balanced","topColor":"#2E4E78","midColor":"#D87862","bottomColor":"#F0B06C","silhouetteColor":"#394C5E","accentColor":"#FFD08A","hazeColor":"#E7B38F","lightColor":"#FFE1A6","horizonHeightPct":40,"detailDensity":48,"layerCount":2,"buildingCount":10,"heightVariance":22,"windowDensity":0,"spireFrequency":0,"roofVariation":0,"targetSelector":""}}',
            "</example>",
        ]
    )

def normalize_artifact_background_treatment_plan(raw_text: str) -> dict[str, Any]:
    parsed = try_parse_json(raw_text)
    if parsed is None:
        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_text, re.IGNORECASE)
        if fenced and fenced.group(1):
            parsed = try_parse_json(fenced.group(1))
    if parsed is None:
        object_slice = extract_first_json_object(raw_text)
        if object_slice:
            parsed = try_parse_json(object_slice)
    if not isinstance(parsed, dict):
        return {"assistantMessage": "", "treatment": {}}
    assistant_message = (
        parsed.get("assistantMessage")
        if isinstance(parsed.get("assistantMessage"), str)
        else parsed.get("message")
        if isinstance(parsed.get("message"), str)
        else ""
    )
    treatment = parsed.get("treatment") if isinstance(parsed.get("treatment"), dict) else {}
    return {"assistantMessage": assistant_message.strip(), "treatment": treatment}

def infer_background_composition_from_request(request: str) -> str:
    lowered = (request or "").strip().lower()
    if re.search(r"\b(?:city|cityscape|urban|skyline|downtown|buildings?|skyscraper)\b", lowered):
        return "skyline"
    if re.search(r"\b(?:mountain|mountains|peak|peaks|alps|cliff|ridge)\b", lowered):
        return "mountains"
    if re.search(r"\b(?:desert|dune|dunes|sand|sandy)\b", lowered):
        return "dunes"
    if re.search(r"\b(?:cloud|clouds|mist|fog|haze)\b", lowered):
        return "clouds"
    return "abstract"

def infer_background_time_of_day_from_request(request: str) -> str:
    lowered = (request or "").strip().lower()
    if re.search(r"\b(?:night|midnight|moonlit|after dark|dark)\b", lowered):
        return "night"
    if re.search(r"\b(?:storm|stormy|thunder|rainy|moody)\b", lowered):
        return "stormy"
    if re.search(r"\b(?:sunset|dusk|twilight)\b", lowered):
        return "sunset"
    if re.search(r"\b(?:golden hour|sunrise|dawn|morning)\b", lowered):
        return "golden-hour"
    return "day"

def background_request_explicitly_allows_pale_palette(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(
        re.search(r"\b(?:white|minimal|foggy white|washed|airy|soft white|monochrome white|snow)\b", lowered)
    )

def background_request_wants_extra_detail(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(
        re.search(
            r"\b(?:detailed?|detail|richer|more detail|more detailed|intricate|complex|layered|depth|textured?|refined|more interesting)\b",
            lowered,
        )
    )

def background_request_mentions_windows(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(re.search(r"\b(?:window|windows|lit windows?|glowing windows?)\b", lowered))

def background_request_mentions_spires(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(re.search(r"\b(?:spire|spires|antenna|antennas|crown|crowns|roofline|rooflines)\b", lowered))

def background_request_mentions_depth_layers(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(
        re.search(
            r"\b(?:foreground|midground|background layers?|multiple layers?|depth layers?|parallax)\b",
            lowered,
        )
    )

def clamp_int(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, int(value)))

def normalize_background_structure_controls(
    *,
    composition: str,
    treatment: dict[str, Any],
    original_edit_request: str,
) -> dict[str, int]:
    defaults_by_composition = {
        "skyline": {
            "detailDensity": 58,
            "layerCount": 3,
            "buildingCount": 18,
            "heightVariance": 52,
            "windowDensity": 28,
            "spireFrequency": 16,
            "roofVariation": 34,
        },
        "mountains": {
            "detailDensity": 54,
            "layerCount": 3,
            "buildingCount": 12,
            "heightVariance": 72,
            "windowDensity": 0,
            "spireFrequency": 0,
            "roofVariation": 0,
        },
        "dunes": {
            "detailDensity": 50,
            "layerCount": 3,
            "buildingCount": 10,
            "heightVariance": 46,
            "windowDensity": 0,
            "spireFrequency": 0,
            "roofVariation": 0,
        },
        "clouds": {
            "detailDensity": 46,
            "layerCount": 3,
            "buildingCount": 10,
            "heightVariance": 32,
            "windowDensity": 0,
            "spireFrequency": 0,
            "roofVariation": 0,
        },
        "abstract": {
            "detailDensity": 48,
            "layerCount": 2,
            "buildingCount": 10,
            "heightVariance": 28,
            "windowDensity": 0,
            "spireFrequency": 0,
            "roofVariation": 0,
        },
    }
    defaults = dict(
        defaults_by_composition.get(composition, defaults_by_composition["abstract"])
    )
    if background_request_wants_extra_detail(original_edit_request):
        defaults["detailDensity"] = max(defaults["detailDensity"], 72)
        if composition == "skyline":
            defaults["layerCount"] = max(defaults["layerCount"], 4)
            defaults["buildingCount"] = max(defaults["buildingCount"], 24)
            defaults["heightVariance"] = max(defaults["heightVariance"], 66)
            defaults["windowDensity"] = max(defaults["windowDensity"], 42)
            defaults["spireFrequency"] = max(defaults["spireFrequency"], 22)
            defaults["roofVariation"] = max(defaults["roofVariation"], 46)
    if composition == "skyline" and background_request_mentions_windows(original_edit_request):
        defaults["detailDensity"] = max(defaults["detailDensity"], 78)
        defaults["windowDensity"] = max(defaults["windowDensity"], 58)
    if composition == "skyline" and background_request_mentions_spires(original_edit_request):
        defaults["detailDensity"] = max(defaults["detailDensity"], 78)
        defaults["spireFrequency"] = max(defaults["spireFrequency"], 42)
        defaults["roofVariation"] = max(defaults["roofVariation"], 58)
    if composition == "skyline" and background_request_mentions_depth_layers(original_edit_request):
        defaults["layerCount"] = max(defaults["layerCount"], 4)
        defaults["detailDensity"] = max(defaults["detailDensity"], 74)

    bounds = {
        "detailDensity": (10, 90),
        "layerCount": (2, 4),
        "buildingCount": (8, 32),
        "heightVariance": (10, 95),
        "windowDensity": (0, 100),
        "spireFrequency": (0, 100),
        "roofVariation": (0, 100),
    }
    normalized: dict[str, int] = {}
    for key, (minimum, maximum) in bounds.items():
        raw_value = treatment.get(key)
        if isinstance(raw_value, int):
            normalized[key] = clamp_int(raw_value, minimum, maximum)
        else:
            normalized[key] = clamp_int(defaults[key], minimum, maximum)

    if composition != "skyline":
        normalized["windowDensity"] = 0
        normalized["spireFrequency"] = 0
        normalized["roofVariation"] = 0

    if composition == "skyline" and background_request_wants_extra_detail(
        original_edit_request
    ):
        normalized["layerCount"] = max(normalized["layerCount"], 3)
        normalized["buildingCount"] = max(normalized["buildingCount"], 18)
        normalized["heightVariance"] = max(normalized["heightVariance"], 48)
        normalized["windowDensity"] = max(normalized["windowDensity"], 26)
        normalized["roofVariation"] = max(normalized["roofVariation"], 28)
    if composition == "skyline" and background_request_mentions_windows(
        original_edit_request
    ):
        normalized["windowDensity"] = max(normalized["windowDensity"], 48)
    if composition == "skyline" and background_request_mentions_spires(
        original_edit_request
    ):
        normalized["spireFrequency"] = max(normalized["spireFrequency"], 34)
        normalized["roofVariation"] = max(normalized["roofVariation"], 46)
    return normalized

def default_background_palette(time_of_day: str) -> dict[str, str]:
    palettes = {
        "day": {
            "topColor": "#83BFE6",
            "midColor": "#C9DEF0",
            "bottomColor": "#F0CF9C",
            "silhouetteColor": "#3D5670",
            "accentColor": "#8DD3FF",
            "hazeColor": "#D7EBF7",
            "lightColor": "#FFF0C2",
        },
        "golden-hour": {
            "topColor": "#6DA6D6",
            "midColor": "#F2C789",
            "bottomColor": "#EF9E5B",
            "silhouetteColor": "#38445A",
            "accentColor": "#FFD38A",
            "hazeColor": "#F3D5AB",
            "lightColor": "#FFF0CF",
        },
        "sunset": {
            "topColor": "#27395D",
            "midColor": "#DB7B62",
            "bottomColor": "#FFBF7A",
            "silhouetteColor": "#1C2234",
            "accentColor": "#FFB561",
            "hazeColor": "#E7A07F",
            "lightColor": "#FFD8AE",
        },
        "night": {
            "topColor": "#081728",
            "midColor": "#112743",
            "bottomColor": "#2A3E5A",
            "silhouetteColor": "#0B0F19",
            "accentColor": "#5CBCFF",
            "hazeColor": "#243650",
            "lightColor": "#FFE0A4",
        },
        "stormy": {
            "topColor": "#304862",
            "midColor": "#556779",
            "bottomColor": "#8F8C86",
            "silhouetteColor": "#1B232D",
            "accentColor": "#B8C9D9",
            "hazeColor": "#90A1B0",
            "lightColor": "#DDE6EF",
        },
    }
    return dict(palettes.get(time_of_day, palettes["day"]))

def parse_hex_color(value: str) -> tuple[int, int, int] | None:
    text = (value or "").strip()
    match = re.fullmatch(r"#([0-9a-fA-F]{6})", text)
    if not match:
        return None
    raw = match.group(1)
    return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)

def format_hex_color(rgb: tuple[int, int, int]) -> str:
    r, g, b = rgb
    return f"#{max(0, min(255, r)):02X}{max(0, min(255, g)):02X}{max(0, min(255, b)):02X}"

def color_luminance(hex_color: str) -> float:
    rgb = parse_hex_color(hex_color)
    if not rgb:
        return 0.0
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255.0

def blend_hex_colors(base: str, accent: str, amount: float) -> str:
    base_rgb = parse_hex_color(base)
    accent_rgb = parse_hex_color(accent)
    if not base_rgb or not accent_rgb:
        return base
    weight = max(0.0, min(1.0, amount))
    blended = tuple(
        round(base_channel * (1.0 - weight) + accent_channel * weight)
        for base_channel, accent_channel in zip(base_rgb, accent_rgb)
    )
    return format_hex_color(blended)

def normalize_background_treatment(
    treatment: dict[str, Any],
    original_edit_request: str,
) -> dict[str, Any]:
    inferred_composition = infer_background_composition_from_request(original_edit_request)
    inferred_time = infer_background_time_of_day_from_request(original_edit_request)
    composition = str(treatment.get("composition") or inferred_composition).strip().lower()
    if composition not in {"abstract", "skyline", "mountains", "dunes", "clouds"}:
        composition = inferred_composition
    if inferred_composition != "abstract":
        composition = inferred_composition

    time_of_day = str(treatment.get("timeOfDay") or inferred_time).strip().lower()
    if time_of_day not in {"day", "golden-hour", "sunset", "night", "stormy"}:
        time_of_day = inferred_time
    if inferred_time != "day":
        time_of_day = inferred_time

    intensity = str(treatment.get("intensity") or "balanced").strip().lower()
    if intensity not in {"soft", "balanced", "dramatic"}:
        intensity = "balanced"

    palette = default_background_palette(time_of_day)
    for key in (
        "topColor",
        "midColor",
        "bottomColor",
        "silhouetteColor",
        "accentColor",
        "hazeColor",
        "lightColor",
    ):
        value = treatment.get(key)
        if isinstance(value, str) and parse_hex_color(value):
            palette[key] = value.upper()

    luminances = [
        color_luminance(palette["topColor"]),
        color_luminance(palette["midColor"]),
        color_luminance(palette["bottomColor"]),
    ]
    if (
        not background_request_explicitly_allows_pale_palette(original_edit_request)
        and max(luminances) - min(luminances) < 0.14
        and sum(luminances) / len(luminances) > 0.72
    ):
        palette = default_background_palette(time_of_day)

    if intensity == "dramatic":
        palette["topColor"] = blend_hex_colors(palette["topColor"], "#000814", 0.18)
        palette["silhouetteColor"] = blend_hex_colors(palette["silhouetteColor"], "#000000", 0.22)
        palette["accentColor"] = blend_hex_colors(palette["accentColor"], "#FFD38A", 0.16)
    elif intensity == "soft":
        palette["topColor"] = blend_hex_colors(palette["topColor"], "#FFFFFF", 0.08)
        palette["hazeColor"] = blend_hex_colors(palette["hazeColor"], "#FFFFFF", 0.18)

    horizon_height = treatment.get("horizonHeightPct")
    target_selector = (
        treatment.get("targetSelector").strip()
        if isinstance(treatment.get("targetSelector"), str)
        else ""
    )
    structure = normalize_background_structure_controls(
        composition=composition,
        treatment=treatment,
        original_edit_request=original_edit_request,
    )
    return {
        "composition": composition,
        "timeOfDay": time_of_day,
        "intensity": intensity,
        "targetSelector": target_selector,
        "horizonHeightPct": int(horizon_height)
        if isinstance(horizon_height, int)
        else 42,
        **palette,
        **structure,
    }

def serialize_artifact_background_treatment_config(
    treatment_config: dict[str, Any],
) -> str:
    return json.dumps(treatment_config, separators=(",", ":"), ensure_ascii=True).replace(
        "</", "<\\/"
    )

def extract_artifact_background_treatment_config_text(html: str) -> str:
    pattern = re.compile(
        rf"<script\b[^>]*\bid\s*=\s*['\"]{re.escape(ARTIFACT_BACKGROUND_TREATMENT_SCRIPT_ID)}['\"][^>]*>(?P<body>[\s\S]*?)</script>",
        re.IGNORECASE,
    )
    match = pattern.search(html or "")
    if not match:
        return ""
    return (match.group("body") or "").strip()

def parse_artifact_background_treatment_config(html: str) -> dict[str, Any]:
    text = extract_artifact_background_treatment_config_text(html)
    parsed = try_parse_json(text) if text else None
    return parsed if isinstance(parsed, dict) else {}

def upsert_artifact_background_treatment_config(
    html: str, treatment_config: dict[str, Any]
) -> str:
    script_tag = (
        f'<script id="{ARTIFACT_BACKGROUND_TREATMENT_SCRIPT_ID}" type="application/json">'
        f"{serialize_artifact_background_treatment_config(treatment_config)}</script>"
    )
    pattern = re.compile(
        rf"<script\b[^>]*\bid\s*=\s*['\"]{re.escape(ARTIFACT_BACKGROUND_TREATMENT_SCRIPT_ID)}['\"][^>]*>[\s\S]*?</script>",
        re.IGNORECASE,
    )
    if pattern.search(html or ""):
        return pattern.sub(script_tag, html, count=1)
    if re.search(r"</head>", html, re.IGNORECASE):
        return re.sub(r"</head>", f"{script_tag}\n</head>", html, count=1, flags=re.IGNORECASE)
    if re.search(r"<body\b[^>]*>", html, re.IGNORECASE):
        return re.sub(
            r"<body\b[^>]*>",
            lambda match: f"{match.group(0)}\n{script_tag}",
            html,
            count=1,
            flags=re.IGNORECASE,
        )
    if re.search(r"</body>", html, re.IGNORECASE):
        return re.sub(r"</body>", f"{script_tag}\n</body>", html, count=1, flags=re.IGNORECASE)
    return f"{script_tag}\n{html}"

def apply_background_treatment_to_artifact_html(
    *,
    current_html: str,
    treatment: dict[str, Any],
    original_edit_request: str,
) -> tuple[str, list[str]]:
    normalized = normalize_background_treatment(treatment, original_edit_request)
    requested_selector = normalized.get("targetSelector") or "#background"
    chosen_target_selector = choose_artifact_background_treatment_target_selector(
        current_html,
        requested_selector,
    )
    scene_root_candidates = [
        candidate
        for candidate in extract_artifact_scene_root_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    scene_root_selector = choose_scene_root_selector_candidate(scene_root_candidates)
    treatment_config = {
        **normalized,
        "targetSelector": chosen_target_selector or "",
        "sceneRootSelector": scene_root_selector or "",
        "allowPalePalette": background_request_explicitly_allows_pale_palette(
            original_edit_request
        ),
        "requestText": (original_edit_request or "").strip(),
        "runtimeMode": "overlay",
    }
    working = upsert_artifact_background_treatment_config(current_html, treatment_config)
    issues = validate_background_edit_result(
        original_html=current_html,
        edited_html=working,
        original_edit_request=original_edit_request,
    )
    return (working, issues) if issues else (working, [])

def describe_background_time_of_day(time_of_day: str) -> str:
    mapping = {
        "day": "daytime",
        "golden-hour": "golden-hour",
        "sunset": "sunset",
        "night": "nighttime",
        "stormy": "stormy",
    }
    return mapping.get((time_of_day or "").strip().lower(), "daytime")

def build_applied_background_treatment_assistant_message(
    treatment_config: dict[str, Any], original_edit_request: str
) -> str:
    composition = str(treatment_config.get("composition") or "abstract").strip().lower()
    time_of_day = describe_background_time_of_day(
        str(treatment_config.get("timeOfDay") or "day").strip().lower()
    )
    intensity = str(treatment_config.get("intensity") or "balanced").strip().lower()
    intensity_text = {
        "soft": "soft",
        "balanced": "layered",
        "dramatic": "dramatic",
    }.get(intensity, "layered")
    if composition == "skyline":
        layer_count = clamp_int(int(treatment_config.get("layerCount") or 3), 2, 4)
        building_count = clamp_int(
            int(treatment_config.get("buildingCount") or 18), 8, 32
        )
        height_variance = clamp_int(
            int(treatment_config.get("heightVariance") or 52), 10, 95
        )
        window_density = clamp_int(
            int(treatment_config.get("windowDensity") or 0), 0, 100
        )
        spire_frequency = clamp_int(
            int(treatment_config.get("spireFrequency") or 0), 0, 100
        )
        roof_variation = clamp_int(
            int(treatment_config.get("roofVariation") or 0), 0, 100
        )
        features = [f"{layer_count} skyline layers"]
        if building_count >= 24:
            features.append("dense varied buildings")
        elif building_count >= 16:
            features.append("multiple varied buildings")
        else:
            features.append("varied building silhouettes")
        if height_variance >= 42:
            features.append("noticeable height variation")
        if window_density >= 22:
            features.append("visible window grids")
        if roof_variation >= 28:
            features.append("varied rooflines")
        if spire_frequency >= 24:
            features.append("spires and antenna accents")
        return (
            f"Applied a {intensity_text} {time_of_day} skyline background with "
            + ", ".join(features)
            + ", while keeping the cars and layout unchanged."
        )
    if composition == "mountains":
        return (
            f"Applied a {intensity_text} {time_of_day} mountain background with layered peaks "
            "while keeping the cars and layout unchanged."
        )
    if composition == "dunes":
        return (
            f"Applied a {intensity_text} {time_of_day} dune background with layered sand shapes "
            "while keeping the cars and layout unchanged."
        )
    if composition == "clouds":
        return (
            f"Applied a {intensity_text} {time_of_day} cloud background with layered haze "
            "while keeping the cars and layout unchanged."
        )
    return (
        f"Applied a {intensity_text} {time_of_day} atmospheric background treatment "
        "while keeping the cars and layout unchanged."
    )

def extract_background_edit_signature(html: str) -> str:
    candidates = extract_artifact_background_selector_candidates(html)
    snippets = extract_artifact_background_style_snippets(html)
    pseudo_snippets: list[str] = []
    treatment_config = extract_artifact_background_treatment_config_text(html)
    for candidate in candidates:
        for pseudo in ("::before", "::after"):
            selector = f"{candidate}{pseudo}"
            selector_re = re.compile(rf"{re.escape(selector)}\s*\{{", re.IGNORECASE)
            for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
                style_body = style_match.group("body") or ""
                match = selector_re.search(style_body)
                if not match:
                    continue
                brace_start = match.end() - 1
                brace_end = find_matching_delimiter(style_body, brace_start, "{", "}")
                if brace_end < 0:
                    continue
                pseudo_snippets.append(style_body[match.start(): brace_end + 1].strip())
                break
    parts = snippets + pseudo_snippets
    if treatment_config:
        parts.append(treatment_config)
    return "\n".join(parts)

def validate_background_edit_result(
    *,
    original_html: str,
    edited_html: str,
    original_edit_request: str,
) -> list[str]:
    if not is_background_visual_edit_request(original_edit_request):
        return []
    original_signature = extract_background_edit_signature(original_html)
    edited_signature = extract_background_edit_signature(edited_html)
    if edited_signature.strip() == original_signature.strip():
        return ["background edit did not materially change the background treatment."]
    if background_request_explicitly_allows_pale_palette(original_edit_request):
        return []
    colors = re.findall(r"#[0-9A-Fa-f]{6}", edited_signature)
    if len(colors) >= 3:
        luminances = [color_luminance(color) for color in colors[:8]]
        if max(luminances) - min(luminances) < 0.1 and sum(luminances) / len(luminances) > 0.74:
            return ["background edit appears visually washed out or too close to blank."]
    config = parse_artifact_background_treatment_config(edited_html)
    if (
        str(config.get("composition") or "").strip().lower() == "skyline"
        and background_request_wants_extra_detail(original_edit_request)
    ):
        if int(config.get("layerCount") or 0) < 3:
            return ["background edit still lacks skyline depth layers."]
        if int(config.get("buildingCount") or 0) < 16:
            return ["background edit still lacks skyline density."]
        if int(config.get("heightVariance") or 0) < 40:
            return ["background edit still lacks skyline height variation."]
        if int(config.get("windowDensity") or 0) < 18:
            return ["background edit still lacks visible window detail."]
        if int(config.get("roofVariation") or 0) < 20:
            return ["background edit still lacks varied roofline detail."]
    if (
        str(config.get("composition") or "").strip().lower() == "skyline"
        and background_request_mentions_spires(original_edit_request)
        and int(config.get("spireFrequency") or 0) < 22
    ):
        return ["background edit still lacks the requested spire or antenna detail."]
    return []

def should_fallback_to_generic_patch_after_background_treatment_failure(
    issues: list[str],
) -> bool:
    normalized = [issue.strip().lower() for issue in issues if issue and issue.strip()]
    if not normalized:
        return True
    return all(
        issue in {
            "background treatment planner returned no usable treatment.",
            "no suitable background selector was found in the current artifact html.",
        }
        for issue in normalized
    )
