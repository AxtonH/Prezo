"""
Assemble brand identity into a bounded package for AI generation + CSS injection.

Structured data lives under `guidelines["semantic"]` (see README section in docstring below).
Legacy extraction output (flat keys from `brand_extract`) uses a compact fallback prompt.

Do not duplicate exhaustive guideline text in `llm_prompt` — reference_excerpt carries a capped slice.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote_plus

from .models import BrandContextPackage, BrandProfile

# --- Semantic schema (stored inside BrandProfile.guidelines["semantic"]) -----------------
#
# guidelines["semantic"] = {
#   "colors": {
#     "background", "surface", "text_primary", "text_body", "accent", "border"  # hex
#   },
#   "fonts": {
#     "heading": {"family": "DM Sans", "google_font_slug": "DM+Sans:wght@400;700"},
#     "body": {"family": "Inter", "google_font_slug": "Inter:wght@400;600"},
#   },
#   "logo_url": "https://...",
#   "voice": {
#     "formality": "...",
#     "perspective": "...",
#     "words_to_use": ["..."],
#     "words_to_avoid": ["..."],
#     "tone_summary": "...",
#   },
#   "identity": {
#     "personality": "...",
#     "values": "...",
#     "mission": "...",
#     "tagline": "...",
#   },
#   "visual": {
#     "mood": "...",
#     "patterns": "...",
#     "icon_style": "...",
#     "image_treatment": "...",
#   },
# }

SEMANTIC_COLOR_KEYS = (
    "background",
    "surface",
    "text_primary",
    "text_body",
    "accent",
    "border",
)

CSS_VAR_MAP: dict[str, str] = {
    "background": "--brand-bg",
    "surface": "--brand-surface",
    "text_primary": "--brand-text-primary",
    "text_body": "--brand-text-body",
    "accent": "--brand-accent",
    "border": "--brand-border",
}

REFERENCE_EXCERPT_MAX = 3000
LEGACY_PROMPT_MAX = 2500
# Tight cap for artifact LLM injection (full package can be huge).
EXECUTIVE_SUMMARY_MAX = 900
USER_GUIDELINES_MERGE_MAX = 450


def _trim(s: str, max_len: int) -> str:
    t = (s or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rstrip() + "…"


def _safe_str(v: Any) -> str:
    if isinstance(v, str):
        return v.strip()
    return ""


def _google_fonts_link_from_slugs(slugs: list[str]) -> str:
    if not slugs:
        return ""
    encoded = [quote_plus(s, safe=":+;") for s in slugs if s]
    if not encoded:
        return ""
    href = "https://fonts.googleapis.com/css2?family=" + "&family=".join(encoded) + "&display=swap"
    return f'<link rel="stylesheet" href="{href}" />'


def _build_semantic_package(
    *,
    brand_name: str,
    semantic: dict[str, Any],
    raw_summary: str,
) -> BrandContextPackage:
    colors = semantic.get("colors")
    if not isinstance(colors, dict):
        colors = {}

    css_lines = [":root {"]
    for key in SEMANTIC_COLOR_KEYS:
        hex_val = _safe_str(colors.get(key))
        if not hex_val:
            continue
        if not hex_val.startswith("#"):
            hex_val = f"#{hex_val.lstrip('#')}"
        var = CSS_VAR_MAP.get(key)
        if var:
            css_lines.append(f"  {var}: {hex_val};")
    css_lines.append("}")
    css_block = "\n".join(css_lines) if len(css_lines) > 2 else ""

    fonts = semantic.get("fonts")
    slugs: list[str] = []
    heading_font = ""
    body_font = ""
    if isinstance(fonts, dict):
        h = fonts.get("heading")
        b = fonts.get("body")
        if isinstance(h, dict):
            heading_font = _safe_str(h.get("family"))
            hs = _safe_str(h.get("google_font_slug"))
            if hs:
                slugs.append(hs)
        if isinstance(b, dict):
            body_font = _safe_str(b.get("family"))
            bs = _safe_str(b.get("google_font_slug"))
            if bs and bs not in slugs:
                slugs.append(bs)

    font_links_html = _google_fonts_link_from_slugs(slugs)

    logo_url = _safe_str(semantic.get("logo_url")) or None
    voice = semantic.get("voice") if isinstance(semantic.get("voice"), dict) else {}
    identity = semantic.get("identity") if isinstance(semantic.get("identity"), dict) else {}
    visual = semantic.get("visual") if isinstance(semantic.get("visual"), dict) else {}

    ref = _trim(raw_summary, REFERENCE_EXCERPT_MAX)

    sections: list[str] = [
        "--- BRAND CONSTRAINTS (semantic) ---",
        f"Brand name: {brand_name}",
        "",
        "1) Colors — Use ONLY these CSS variables for themed UI (do not invent new palette tokens): "
        "--brand-bg, --brand-surface, --brand-text-primary, --brand-text-body, --brand-accent, --brand-border.",
        "2) Fonts — Use ONLY the linked Google Fonts families for heading and body copy as specified below.",
    ]

    if heading_font or body_font:
        sections.append(
            f"   Heading font: {heading_font or '(default)'} | Body font: {body_font or '(default)'}"
        )

    if logo_url:
        sections.extend(["", "3) Logo — Prefer this asset when a logo is needed:", f"   {logo_url}"])

    vf = _safe_str(voice.get("formality"))
    vp = _safe_str(voice.get("perspective"))
    vt = _safe_str(voice.get("tone_summary"))
    if vf or vp or vt:
        sections.extend(["", "4) Writing style —", f"   Formality: {vf or '—'}", f"   Perspective: {vp or '—'}", f"   Tone: {vt or '—'}"])

    w_use = voice.get("words_to_use")
    w_avoid = voice.get("words_to_avoid")
    if isinstance(w_use, list) and w_use:
        sections.append(f"   Words to use: {', '.join(str(x) for x in w_use[:20])}")
    if isinstance(w_avoid, list) and w_avoid:
        sections.append(f"   Words to avoid: {', '.join(str(x) for x in w_avoid[:20])}")

    ip = _safe_str(identity.get("personality"))
    iv = _safe_str(identity.get("values"))
    im = _safe_str(identity.get("mission"))
    it = _safe_str(identity.get("tagline"))
    if ip or iv or im or it:
        sections.extend(
            [
                "",
                "5) Brand identity —",
                f"   Personality: {ip or '—'}",
                f"   Values: {iv or '—'}",
                f"   Mission: {im or '—'}",
                f"   Tagline: {it or '—'}",
            ]
        )

    vm = _safe_str(visual.get("mood"))
    vp2 = _safe_str(visual.get("patterns"))
    vi = _safe_str(visual.get("icon_style"))
    vimg = _safe_str(visual.get("image_treatment"))
    if vm or vp2 or vi or vimg:
        sections.extend(
            [
                "",
                "6) Visual style —",
                f"   Mood: {vm or '—'}",
                f"   Patterns: {vp2 or '—'}",
                f"   Icons: {vi or '—'}",
                f"   Imagery: {vimg or '—'}",
            ]
        )

    if ref:
        sections.extend(["", "7) Reference excerpt (supporting only; prefer sections 1–6):", ref])

    sections.append("--- END BRAND CONSTRAINTS ---")

    llm_prompt = "\n".join(sections)

    return BrandContextPackage(
        brand_name=brand_name,
        css_block=css_block,
        font_links_html=font_links_html,
        llm_prompt=llm_prompt,
        logo_url=logo_url,
        reference_excerpt=ref,
        mode="semantic",
    )


def _format_fonts_legacy(g: dict[str, Any]) -> str:
    fonts = g.get("fonts")
    if not isinstance(fonts, list):
        return ""
    lines: list[str] = []
    for item in fonts[:8]:
        if isinstance(item, str):
            lines.append(f"  - {item}")
        elif isinstance(item, dict):
            fam = _safe_str(item.get("family")) or "Unknown"
            w = item.get("weights")
            u = _safe_str(item.get("usage"))
            extra = []
            if isinstance(w, list):
                extra.append("weights: " + ", ".join(str(x) for x in w[:6]))
            if u:
                extra.append(f"usage: {u}")
            lines.append(f"  - {fam}" + (" | " + " | ".join(extra) if extra else ""))
    return "\n".join(lines).strip()


def _format_color_lines_legacy(g: dict[str, Any], key: str, max_lines: int = 8) -> str:
    arr = g.get(key)
    if not isinstance(arr, list):
        return ""
    lines: list[str] = []
    for item in arr[:max_lines]:
        if isinstance(item, str) and item.strip():
            lines.append(f"  {item.strip()}")
    return "\n".join(lines).strip()


def _build_legacy_package(
    *,
    brand_name: str,
    guidelines: dict[str, Any],
    raw_summary: str,
) -> BrandContextPackage:
    g = guidelines
    chunks: list[str] = []

    pc = _format_color_lines_legacy(g, "primary_colors", 6)
    if pc:
        chunks.append(f"Primary colors:\n{pc}")

    sc = _format_color_lines_legacy(g, "secondary_colors", 4)
    if sc:
        chunks.append(f"Secondary colors:\n{sc}")

    ac = _format_color_lines_legacy(g, "accent_colors", 4)
    if ac:
        chunks.append(f"Accent colors:\n{ac}")

    ff = _format_fonts_legacy(g)
    if ff:
        chunks.append(f"Fonts:\n{ff}")

    for label, key in (
        ("Tone of voice", "tone_of_voice"),
        ("Visual style", "visual_style"),
        ("Typography hierarchy", "typography_hierarchy"),
    ):
        val = _trim(_safe_str(g.get(key)), 500)
        if val:
            chunks.append(f"{label}:\n{val}")

    kp = g.get("key_principles")
    if isinstance(kp, list) and kp:
        lines = [f"  - {_safe_str(x)}" for x in kp[:8] if _safe_str(x)]
        if lines:
            chunks.append("Key principles:\n" + "\n".join(lines))

    ref = _trim(raw_summary, REFERENCE_EXCERPT_MAX)
    if ref:
        chunks.append(f"Reference notes:\n{_trim(ref, 1200)}")

    body = "\n\n".join(chunks)
    llm_prompt = _trim(
        "--- BRAND CONSTRAINTS (legacy extraction) ---\n"
        f"Brand: {brand_name}\n\n"
        "Apply the following as design and copy guidance. Prefer clarity over exhaustive compliance.\n\n"
        f"{body}\n"
        "--- END BRAND CONSTRAINTS ---",
        LEGACY_PROMPT_MAX,
    )

    return BrandContextPackage(
        brand_name=brand_name,
        css_block="",
        font_links_html="",
        llm_prompt=llm_prompt,
        logo_url=None,
        reference_excerpt=ref,
        mode="legacy",
    )


def build_brand_context(
    *,
    brand_name: str,
    guidelines: dict[str, Any],
    raw_summary: str = "",
) -> BrandContextPackage:
    """
    Build a bounded context package. Prefer `guidelines["semantic"]` when present.
    """
    semantic = guidelines.get("semantic")
    if isinstance(semantic, dict) and semantic.get("colors"):
        # Require at least one color key to treat as semantic mode
        colors = semantic.get("colors")
        if isinstance(colors, dict) and any(_safe_str(colors.get(k)) for k in SEMANTIC_COLOR_KEYS):
            return _build_semantic_package(
                brand_name=brand_name,
                semantic=semantic,
                raw_summary=raw_summary,
            )
    return _build_legacy_package(
        brand_name=brand_name,
        guidelines=guidelines,
        raw_summary=raw_summary,
    )


def build_brand_context_from_profile(profile: BrandProfile) -> BrandContextPackage:
    return build_brand_context(
        brand_name=profile.name,
        guidelines=profile.guidelines if isinstance(profile.guidelines, dict) else {},
        raw_summary=profile.raw_summary or "",
    )


def _compact_root_css_for_summary(css: str) -> str:
    t = (css or "").strip()
    if not t:
        return ""
    pairs = re.findall(r"(--brand-[\w-]+)\s*:\s*([^;]+);", t)
    if not pairs:
        return _trim(t.replace("\n", " "), 180)
    bits = [f"{k}={v.strip()}" for k, v in pairs[:10]]
    return _trim(", ".join(bits), 400)


def _strip_legacy_brand_core(llm_prompt: str) -> str:
    t = (llm_prompt or "").strip()
    if not t:
        return ""
    t = re.sub(
        r"^--- BRAND CONSTRAINTS \(legacy extraction\) ---\s*",
        "",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(r"\s*--- END BRAND CONSTRAINTS ---\s*$", "", t, flags=re.IGNORECASE)
    return t.strip()


def _extract_semantic_tone_snippet(llm_prompt: str) -> str:
    """Short slice from semantic llm_prompt near Writing style."""
    t = (llm_prompt or "").strip()
    if not t:
        return ""
    m = re.search(
        r"4\)\s*Writing style.*?(?=\n\s*\d+\)\s|(?:\n\s*)?--- END BRAND)",
        t,
        re.DOTALL | re.IGNORECASE,
    )
    if m:
        return _trim(m.group(0).strip(), 260)
    return ""


def build_brand_executive_summary_for_artifact(pkg: BrandContextPackage) -> str:
    """
    Short executive summary for poll-game artifact LLM context only.
    Avoids dumping full llm_prompt / raw extraction into designGuidelines.
    """
    parts: list[str] = []
    parts.append(f"Brand: {pkg.brand_name} ({pkg.mode})")
    pal = _compact_root_css_for_summary(pkg.css_block)
    if pal:
        parts.append(f"Palette: {pal}")
    if pkg.font_links_html.strip():
        parts.append("Fonts: include the Google Fonts <link> tags in <head>.")
    if pkg.logo_url:
        parts.append(f"Logo: {pkg.logo_url}")
    if pkg.reference_excerpt.strip():
        parts.append("Voice: " + _trim(pkg.reference_excerpt.strip(), 320))
    if pkg.mode == "legacy" and pkg.llm_prompt:
        core = _strip_legacy_brand_core(pkg.llm_prompt)
        if core:
            parts.append("Guidance: " + _trim(core, 520))
    elif pkg.mode == "semantic":
        tone = _extract_semantic_tone_snippet(pkg.llm_prompt)
        if tone:
            parts.append(tone)
    text = "\n".join(p for p in parts if p)
    return _trim(text, EXECUTIVE_SUMMARY_MAX)


def merge_brand_package_with_design_guidelines(
    existing: Any,
    pkg: BrandContextPackage,
) -> str:
    """
    Executive summary + optional user-entered guidelines (each capped).
    Used when injecting a saved profile into artifact generation (server-side).
    """
    executive = build_brand_executive_summary_for_artifact(pkg)
    ex = existing if isinstance(existing, str) else ""
    ex = ex.strip()
    if ex:
        ex = _trim(ex, USER_GUIDELINES_MERGE_MAX)
        return (
            executive
            + "\n\n--- User-provided guidelines ---\n"
            + ex
        )
    return executive
