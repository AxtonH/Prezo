"""
Small structured `brand_facts` object for LLM injection — exact hex, roles, typography, logo.

Regenerated on every brand profile save alongside `prompt_brand_guidelines`.
"""

from __future__ import annotations

import re
from typing import Any

_HEX = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")


def _safe_str(v: Any) -> str:
    if isinstance(v, str):
        return v.strip()
    return ""


def _first_hex(text: str) -> str:
    m = _HEX.search(text)
    if not m:
        return ""
    hx = m.group(0)
    if len(hx) == 4 and hx.startswith("#"):
        r, g, b = hx[1], hx[2], hx[3]
        return f"#{r}{r}{g}{g}{b}{b}".upper()
    return hx.upper() if len(hx) == 7 else hx


def _typography_slot(slot: Any) -> dict[str, Any] | None:
    if not isinstance(slot, dict):
        return None
    fam = _safe_str(slot.get("family"))
    if not fam:
        return None
    out: dict[str, Any] = {"family": fam[:120]}
    src = _safe_str(slot.get("source") or "")
    if src:
        out["source"] = src[:32]
    if src == "custom" and _safe_str(slot.get("custom_url")):
        out["custom_url"] = _safe_str(slot.get("custom_url"))[:2048]
    return out


def build_brand_facts(guidelines: dict[str, Any]) -> dict[str, Any]:
    """
    Build a compact JSON-serializable dict: colors (with hierarchy), typography, logo.

    Intended for LLM context where exact values matter more than prose.
    """
    g = guidelines if isinstance(guidelines, dict) else {}
    ui = g.get("ui_identity")
    ui = ui if isinstance(ui, dict) else {}

    colors: list[dict[str, Any]] = []
    roles = ui.get("color_roles")
    if isinstance(roles, list) and roles:
        ranked: list[tuple[int, dict[str, Any]]] = []
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
            hx = _safe_str(item.get("hex"))
            if hx and not hx.startswith("#"):
                hx = f"#{hx.lstrip('#')}"
            row: dict[str, Any] = {
                "role": (_safe_str(item.get("role")) or "Color")[:120],
                "hex": hx or "#CCCCCC",
                "hierarchy_rank": max(1, min(6, rank)),
            }
            usage = _safe_str(item.get("usage"))
            if usage:
                row["usage"] = usage[:240]
            surface = _safe_str(item.get("surface"))
            if surface:
                row["surface"] = surface[:40]
            colors.append(row)
    else:
        prim = g.get("primary_colors")
        if isinstance(prim, list):
            for i, line in enumerate(prim[:8], start=1):
                s = _safe_str(line) if isinstance(line, str) else ""
                if not s:
                    continue
                hx = _first_hex(s)
                colors.append(
                    {
                        "role": f"Swatch {i}",
                        "hex": hx or "#CCCCCC",
                        "hierarchy_rank": i,
                        "label": s[:400],
                    }
                )

    typography: dict[str, Any] = {}
    typo = ui.get("typography")
    if isinstance(typo, dict):
        for key, out_key in (
            ("heading_1", "heading_1"),
            ("heading_2", "heading_2"),
            ("body", "body"),
        ):
            slot = _typography_slot(typo.get(key))
            if slot:
                typography[out_key] = slot

    logo_out: dict[str, Any] | None = None
    logo = ui.get("logo")
    if isinstance(logo, dict):
        url = _safe_str(logo.get("url"))
        if url:
            logo_out = {"url": url[:2048]}
            src = _safe_str(logo.get("source") or "")
            if src:
                logo_out["source"] = src[:32]

    out: dict[str, Any] = {"colors": colors, "logo": logo_out}
    if typography:
        out["typography"] = typography
    return out
