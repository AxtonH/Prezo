"""Deterministic, no-LLM patch attempts for recognized artifact edit requests.

Each attempt_builtin_* function recognizes a specific request shape
(cityscape background, title/label overlap spacing, layout orientation)
and applies the edit directly via CSS surgery or a synthesized patch
plan, returning None when the request does not match. Extracted from
app.api.ai.
"""

from __future__ import annotations

from typing import Any

from .artifact_css_edit import (
    ensure_css_property_in_artifact_html,
    upsert_css_rule_in_artifact_html,
)
from .artifact_edit_intent import (
    artifact_edit_request_requires_external_asset_url,
    infer_requested_artifact_layout_orientation,
    is_city_background_edit_request,
    is_layout_orientation_artifact_edit_request,
    is_title_overlap_spacing_artifact_edit_request,
)
from .artifact_package import ARTIFACT_PACKAGE_STYLES_FILE
from .artifact_patch import apply_artifact_patch_plan_to_package
from .artifact_selectors import (
    choose_background_selector_candidate,
    choose_layout_selector_candidate,
    choose_scene_root_selector_candidate,
    choose_title_selector_candidate,
    extract_artifact_background_selector_candidates,
    extract_artifact_layout_selector_candidates,
    extract_artifact_scene_root_selector_candidates,
    extract_artifact_style_rule_selectors,
    extract_artifact_title_selector_candidates,
    prefer_selectors_with_existing_css_rule,
)


def attempt_builtin_cityscape_background_patch(
    *,
    current_html: str,
    original_edit_request: str,
) -> tuple[str, str]:
    if artifact_edit_request_requires_external_asset_url(original_edit_request):
        return "", ""
    if not is_city_background_edit_request(original_edit_request):
        return "", ""
    background_candidates = [
        candidate
        for candidate in extract_artifact_background_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    target_selector = choose_background_selector_candidate("#city-bg", background_candidates)
    if not target_selector:
        return "", ""

    working = current_html
    for property_name, value in (
        ("position", "relative"),
        ("overflow", "hidden"),
        ("isolation", "isolate"),
        (
            "background",
            "linear-gradient(180deg, #0f2138 0%, #31506f 44%, #f2b77d 100%)",
        ),
    ):
        working = ensure_css_property_in_artifact_html(
            working,
            target_selector,
            property_name,
            value,
        )

    skyline_rule = "\n".join(
        [
            "content: \"\";",
            "position: absolute;",
            "left: 0;",
            "right: 0;",
            "bottom: 0;",
            "height: 46%;",
            "pointer-events: none;",
            "z-index: 0;",
            "opacity: 0.92;",
            "background:",
            "  linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 18%),",
            "  linear-gradient(90deg,",
            "    rgba(15,20,34,0.96) 0 5%,",
            "    transparent 5% 7%,",
            "    rgba(18,24,40,0.96) 7% 13%,",
            "    transparent 13% 16%,",
            "    rgba(12,18,32,0.95) 16% 21%,",
            "    transparent 21% 24%,",
            "    rgba(16,22,36,0.96) 24% 31%,",
            "    transparent 31% 34%,",
            "    rgba(19,25,43,0.97) 34% 41%,",
            "    transparent 41% 44%,",
            "    rgba(14,21,35,0.96) 44% 51%,",
            "    transparent 51% 54%,",
            "    rgba(20,27,46,0.97) 54% 62%,",
            "    transparent 62% 65%,",
            "    rgba(17,24,42,0.96) 65% 72%,",
            "    transparent 72% 75%,",
            "    rgba(13,19,33,0.96) 75% 83%,",
            "    transparent 83% 86%,",
            "    rgba(18,24,40,0.96) 86% 100%);",
        ]
    )
    glow_rule = "\n".join(
        [
            "content: \"\";",
            "position: absolute;",
            "inset: 0;",
            "pointer-events: none;",
            "z-index: 0;",
            "opacity: 0.82;",
            "background:",
            "  radial-gradient(circle at 14% 22%, rgba(255,221,170,0.22) 0 1.1%, transparent 1.2%),",
            "  radial-gradient(circle at 26% 18%, rgba(255,210,150,0.16) 0 1%, transparent 1.1%),",
            "  radial-gradient(circle at 39% 28%, rgba(255,229,186,0.18) 0 1%, transparent 1.1%),",
            "  radial-gradient(circle at 58% 20%, rgba(255,215,156,0.18) 0 1%, transparent 1.1%),",
            "  radial-gradient(circle at 74% 25%, rgba(255,228,180,0.18) 0 1%, transparent 1.1%),",
            "  radial-gradient(circle at 86% 19%, rgba(255,214,148,0.16) 0 1%, transparent 1.1%),",
            "  linear-gradient(180deg, rgba(255,189,120,0.18) 0%, rgba(255,189,120,0.02) 34%, rgba(255,255,255,0) 55%),",
            "  linear-gradient(0deg, rgba(255,210,150,0.12) 0%, rgba(255,210,150,0) 28%);",
            "mix-blend-mode: screen;",
        ]
    )
    working = upsert_css_rule_in_artifact_html(
        working,
        f"{target_selector}::before",
        skyline_rule,
    )
    working = upsert_css_rule_in_artifact_html(
        working,
        f"{target_selector}::after",
        glow_rule,
    )
    return (
        working,
        "Applied a cityscape-style background treatment while keeping the cars and layout unchanged.",
    )

def attempt_builtin_title_overlap_spacing_patch(
    *,
    current_html: str,
    current_package: dict[str, Any] | None,
    original_edit_request: str,
) -> tuple[str, dict[str, Any] | None, str]:
    if not is_title_overlap_spacing_artifact_edit_request(original_edit_request):
        return "", current_package, ""

    style_selector_candidates = extract_artifact_style_rule_selectors(current_html)
    title_candidates = prefer_selectors_with_existing_css_rule(
        extract_artifact_title_selector_candidates(current_html),
        style_selector_candidates,
    )
    layout_candidates = prefer_selectors_with_existing_css_rule(
        extract_artifact_layout_selector_candidates(current_html),
        style_selector_candidates,
    )
    scene_root_candidates = prefer_selectors_with_existing_css_rule(
        extract_artifact_scene_root_selector_candidates(current_html),
        style_selector_candidates,
    )

    title_selector = choose_title_selector_candidate("#header", title_candidates)
    label_selector = choose_title_selector_candidate(".label", title_candidates)
    layout_selector = choose_layout_selector_candidate("#poll-options", layout_candidates)
    scene_root_selector = choose_scene_root_selector_candidate(scene_root_candidates)

    selectors_to_promote: list[str] = []
    for selector in (title_selector, label_selector):
        normalized = selector.strip()
        if not normalized or normalized in selectors_to_promote:
            continue
        selectors_to_promote.append(normalized)

    edits: list[dict[str, str]] = []
    for selector in selectors_to_promote[:2]:
        edits.append(
            {
                "type": "set_css_property",
                "file": ARTIFACT_PACKAGE_STYLES_FILE,
                "selector": selector,
                "property": "position",
                "value": "relative",
            }
        )
        edits.append(
            {
                "type": "set_css_property",
                "file": ARTIFACT_PACKAGE_STYLES_FILE,
                "selector": selector,
                "property": "z-index",
                "value": "4",
            }
        )

    if title_selector:
        edits.append(
            {
                "type": "set_css_property",
                "file": ARTIFACT_PACKAGE_STYLES_FILE,
                "selector": title_selector,
                "property": "margin-bottom",
                "value": "14px",
            }
        )

    if layout_selector:
        edits.append(
            {
                "type": "set_css_property",
                "file": ARTIFACT_PACKAGE_STYLES_FILE,
                "selector": layout_selector,
                "property": "margin-top",
                "value": "14px",
            }
        )
    elif scene_root_selector:
        edits.append(
            {
                "type": "set_css_property",
                "file": ARTIFACT_PACKAGE_STYLES_FILE,
                "selector": scene_root_selector,
                "property": "padding-top",
                "value": "8px",
            }
        )

    if not edits:
        return "", current_package, ""

    plan = {"assistantMessage": "", "edits": edits}
    patched_html, patched_package, issues = apply_artifact_patch_plan_to_package(
        html=current_html,
        artifact_package=current_package,
        plan=plan,
    )
    if issues or not patched_html or patched_html.strip() == current_html.strip():
        return "", current_package, ""
    return (
        patched_html,
        patched_package,
        "Applied a targeted readability patch to keep titles/labels above the blocks and add spacing.",
    )

def attempt_builtin_layout_orientation_patch(
    *,
    current_html: str,
    current_package: dict[str, Any] | None,
    original_edit_request: str,
) -> tuple[str, dict[str, Any] | None, str]:
    if not is_layout_orientation_artifact_edit_request(original_edit_request):
        return "", current_package, ""
    target_orientation = infer_requested_artifact_layout_orientation(
        original_edit_request
    )
    if target_orientation not in {"horizontal", "vertical"}:
        return "", current_package, ""

    layout_candidates = [
        candidate
        for candidate in extract_artifact_layout_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    if not layout_candidates:
        scene_root_candidates = [
            candidate
            for candidate in extract_artifact_scene_root_selector_candidates(current_html)
            if candidate not in {"body", "html"}
        ]
        fallback_selector = choose_scene_root_selector_candidate(scene_root_candidates)
        if fallback_selector:
            layout_candidates = [fallback_selector]
    if not layout_candidates:
        return "", current_package, ""

    preferred_selector = choose_layout_selector_candidate(
        "#poll-options", layout_candidates
    )
    ordered_candidates: list[str] = []
    if preferred_selector:
        ordered_candidates.append(preferred_selector)
    ordered_candidates.extend(
        candidate
        for candidate in layout_candidates
        if candidate not in ordered_candidates
    )

    for target_selector in ordered_candidates[:3]:
        plan = {
            "assistantMessage": "",
            "edits": [
                {
                    "type": "set_css_property",
                    "file": ARTIFACT_PACKAGE_STYLES_FILE,
                    "selector": target_selector,
                    "property": "display",
                    "value": "flex",
                },
                {
                    "type": "set_css_property",
                    "file": ARTIFACT_PACKAGE_STYLES_FILE,
                    "selector": target_selector,
                    "property": "flex-direction",
                    "value": "column" if target_orientation == "vertical" else "row",
                },
                {
                    "type": "set_css_property",
                    "file": ARTIFACT_PACKAGE_STYLES_FILE,
                    "selector": target_selector,
                    "property": "align-items",
                    "value": "stretch",
                },
            ],
        }
        patched_html, patched_package, issues = apply_artifact_patch_plan_to_package(
            html=current_html,
            artifact_package=current_package,
            plan=plan,
        )
        if issues:
            continue
        if not patched_html or patched_html.strip() == current_html.strip():
            continue
        orientation_text = (
            "vertical" if target_orientation == "vertical" else "horizontal"
        )
        return (
            patched_html,
            patched_package,
            f"Applied a targeted layout patch so poll options align {orientation_text}.",
        )
    return "", current_package, ""
