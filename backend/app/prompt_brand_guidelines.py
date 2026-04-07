"""
Build a plain-text `prompt_brand_guidelines` block from saved `BrandProfile.guidelines`.

Sections are assembled deterministically from the user's saved `ui_identity` (and legacy fallbacks)
— not a second LLM call — so saves stay fast and reproducible. Intended for downstream LLM injection.
"""

from __future__ import annotations

from typing import Any

MAX_PROMPT_BRAND_GUIDELINES_CHARS = 14_000

_TONE_AXES: tuple[tuple[str, str, str], ...] = (
    ("serious_playful", "serious", "playful"),
    ("formal_casual", "formal", "casual"),
    ("respectful_irreverent", "respectful", "irreverent"),
    ("matter_of_fact_enthusiastic", "matter-of-fact", "enthusiastic"),
)


def _safe_str(v: Any) -> str:
    if isinstance(v, str):
        return v.strip()
    return ""


def _tone_axis_label(key: str) -> str:
    return key.replace("_", " ").title()


def _tone_axis_sentence(key: str, left: str, right: str, value: Any) -> str:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return ""
    n = max(0, min(100, n))
    label = _tone_axis_label(key)
    if n <= 35:
        return f"- {label}: leans {left} ({n}/100)."
    if n >= 65:
        return f"- {label}: leans {right} ({n}/100)."
    return f"- {label}: balanced ({n}/100)."


def _typography_slot(label: str, slot: Any) -> str:
    if not isinstance(slot, dict):
        return ""
    fam = _safe_str(slot.get("family"))
    if not fam:
        return ""
    src = _safe_str(slot.get("source") or "")
    url = _safe_str(slot.get("custom_url") or "")
    if src == "custom" and url:
        return f"- {label}: {fam} (custom upload)"
    return f"- {label}: {fam}"


def _visual_style_lines(vs: Any) -> list[str]:
    if not isinstance(vs, dict):
        return []
    out: list[str] = []
    mood = _safe_str(vs.get("visual_mood_aesthetic"))
    if mood:
        out.append(f"Mood & aesthetic: {mood}")
    sg = _safe_str(vs.get("style_guidelines"))
    if sg:
        out.append(f"Style guidelines: {sg}")
    de = vs.get("design_elements")
    if isinstance(de, dict):
        for k, title in (
            ("patterns_textures", "Patterns & textures"),
            ("icon_style", "Icon style"),
            ("image_treatment", "Image treatment"),
            ("decorative_elements", "Decorative elements"),
        ):
            t = _safe_str(de.get(k))
            if t:
                out.append(f"{title}: {t}")
    return out


def build_prompt_brand_guidelines(guidelines: dict[str, Any]) -> str:
    """
    Assemble human-readable brand context from `guidelines` (expects `ui_identity` when edited in app).

    Falls back to legacy flat keys (`tone_of_voice`, `primary_colors`) when `ui_identity` is missing.
    """
    g = guidelines if isinstance(guidelines, dict) else {}
    ui = g.get("ui_identity")
    ui = ui if isinstance(ui, dict) else {}

    sections: list[str] = []

    # --- 1) Colors + hierarchy ---
    color_lines: list[str] = []
    roles = ui.get("color_roles")
    if isinstance(roles, list) and roles:
        ranked: list[dict[str, Any]] = []
        for item in roles[:24]:
            if not isinstance(item, dict):
                continue
            try:
                rank = int(item.get("hierarchy_rank", 99))
            except (TypeError, ValueError):
                rank = 99
            ranked.append((rank, item))
        ranked.sort(key=lambda x: x[0])
        for rank, item in ranked[:12]:
            role = _safe_str(item.get("role")) or "Color"
            hx = _safe_str(item.get("hex")) or "—"
            usage = _safe_str(item.get("usage"))
            surface = _safe_str(item.get("surface"))
            extra = f" — {usage}" if usage else ""
            surf = f" [{surface}]" if surface else ""
            color_lines.append(f"- Hierarchy {rank}: {role} — {hx}{extra}{surf}")
    else:
        prim = g.get("primary_colors")
        if isinstance(prim, list):
            for i, line in enumerate(prim[:8], start=1):
                s = _safe_str(line) if isinstance(line, str) else ""
                if s:
                    color_lines.append(f"- Swatch {i}: {s}")
    if color_lines:
        sections.append("## Brand colors (hierarchy)\n" + "\n".join(color_lines))
    else:
        sections.append("## Brand colors (hierarchy)\n- (none specified)")

    # --- 2) Typography ---
    typo_lines: list[str] = []
    typo = ui.get("typography")
    if isinstance(typo, dict):
        typo_lines.append(_typography_slot("Heading 1", typo.get("heading_1")))
        typo_lines.append(_typography_slot("Heading 2", typo.get("heading_2")))
        typo_lines.append(_typography_slot("Body", typo.get("body")))
    typo_lines = [x for x in typo_lines if x]
    if typo_lines:
        sections.append("## Typography\n" + "\n".join(typo_lines))
    else:
        sections.append("## Typography\n- (none specified)")

    # --- 3) Tone ---
    tone_lines: list[str] = []
    tc = ui.get("tone_calibration")
    if isinstance(tc, dict):
        for key, left, right in _TONE_AXES:
            if key in tc:
                s = _tone_axis_sentence(key, left, right, tc.get(key))
                if s:
                    tone_lines.append(s)
    legacy_tone = _safe_str(g.get("tone_of_voice"))
    if legacy_tone:
        if not tone_lines:
            tone_lines.append(f"- Voice: {legacy_tone}")
        else:
            tone_lines.append(f"- Additional voice context: {legacy_tone}")
    if tone_lines:
        sections.append("## Tone\n" + "\n".join(tone_lines))
    else:
        sections.append("## Tone\n- (none specified)")

    # --- 4) Visual style ---
    vs_lines = _visual_style_lines(ui.get("visual_style"))
    if vs_lines:
        sections.append("## Visual style\n" + "\n".join(vs_lines))
    else:
        legacy_vs = _safe_str(g.get("visual_style"))
        if legacy_vs:
            sections.append(f"## Visual style\n{legacy_vs}")
        else:
            sections.append("## Visual style\n- (none specified)")

    # --- 5) Logo ---
    logo = ui.get("logo")
    if isinstance(logo, dict):
        url = _safe_str(logo.get("url"))
        src = _safe_str(logo.get("source") or "")
        if url:
            src_bit = f" ({src})" if src else ""
            sections.append(f"## Logo\n- URL{src_bit}: {url}")
        else:
            sections.append("## Logo\n- (none specified)")
    else:
        sections.append("## Logo\n- (none specified)")

    body = "\n\n".join(sections).strip()
    if len(body) > MAX_PROMPT_BRAND_GUIDELINES_CHARS:
        return body[: MAX_PROMPT_BRAND_GUIDELINES_CHARS - 1].rstrip() + "…"
    return body
