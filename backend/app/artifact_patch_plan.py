"""Patch-plan machinery for targeted artifact edits.

Gates whether a patch edit is viable, builds the patch-edit prompt,
rewrites/compacts/prioritizes model-produced patch plans against the
current HTML, applies them progressively, and evaluates completion and
satisfaction requirements (including title color/decoration analysis).
Extracted from app.api.ai.
"""

from __future__ import annotations

import colorsys
import re
from typing import Any, Callable

from .artifact_css_edit import (
    extract_combined_artifact_css_text,
    extract_css_rule_bodies_for_selector,
    has_css_property_for_selector,
    has_css_property_value_for_selector,
)
from .artifact_edit_intent import (
    artifact_edit_request_requires_external_asset_url,
    classify_artifact_edit_request_scope,
    extract_title_requested_color_tokens,
    infer_requested_artifact_layout_orientation,
    infer_title_decoration_intent,
    is_background_visual_edit_request,
    is_city_background_edit_request,
    is_layout_orientation_artifact_edit_request,
    is_title_decoration_only_request,
    is_title_overlap_spacing_artifact_edit_request,
    is_title_text_artifact_edit_request,
    normalize_requested_color_token,
    request_explicitly_wraps_title_in_container,
)
from .artifact_package import (
    ARTIFACT_PACKAGE_ENTRY_FILE,
    ARTIFACT_PACKAGE_RENDERER_FILE,
    ARTIFACT_PACKAGE_STYLES_FILE,
    build_segmented_artifact_package,
)
from .artifact_patch import (
    apply_artifact_patch_plan_to_package,
    normalize_artifact_patch_plan as normalize_artifact_patch_plan_payload,
)
from .artifact_quality import (
    attempt_artifact_structural_autorepair,
    format_style_overrides_for_prompt,
    get_artifact_patch_source_html,
    restore_artifact_live_hooks_if_missing,
    validate_poll_game_artifact_html,
)
from .artifact_selector_match import find_best_selector_match
from .artifact_selectors import (
    _extract_css_property_map_from_html,
    build_selector_context_map,
    extract_artifact_background_selector_candidates,
    extract_artifact_background_style_snippets,
    extract_artifact_layout_selector_candidates,
    extract_artifact_scene_root_selector_candidates,
    extract_artifact_style_rule_selectors,
    extract_artifact_title_selector_candidates,
    is_layout_like_selector,
    is_primary_title_selector,
    is_title_like_selector,
    prefer_selectors_with_existing_css_rule,
)


ARTIFACT_PATCH_HTML_CHAR_LIMIT = 120000

ARTIFACT_PATCH_CANDIDATE_MAX_EDITS = 64

ARTIFACT_PATCH_BATCH_SIZE = 30

ARTIFACT_PATCH_MAX_BATCHES = 12

TITLE_TOP_DECORATION_DENSE_MIN_BOX_SHADOW_OFFSETS = 2

_PSEUDO_SELECTOR_RE = re.compile(r":{1,2}(?:before|after)\s*$", re.IGNORECASE)

ARTIFACT_SCALE_INTENT_RE = re.compile(
    r"\b(?:increase|enlarge|larger|bigger|grow|scale|expand|boost|widen|heighten|upsize)\b",
    re.IGNORECASE,
)

ARTIFACT_SCALE_AMOUNT_RE = re.compile(r"\b\d{1,3}\s*%\b")

ARTIFACT_SCALE_POLL_TARGET_RE = re.compile(
    r"\b(?:poll|option|options|bar|bars|column|columns|row|rows|lane|lanes|vote|votes)\b",
    re.IGNORECASE,
)

ARTIFACT_SCALE_UNIT_TARGET_RE = re.compile(
    r"\b(?:lego|brick|bricks|stud|studs|block|blocks|tile|tiles|shell|shells|chip|chips|piece|pieces)\b",
    re.IGNORECASE,
)

ARTIFACT_SCALE_INSIDE_POLL_RE = re.compile(
    r"\b(?:inside|within|in)\s+(?:the\s+)?poll\b", re.IGNORECASE
)

ARTIFACT_SCALE_CSS_PROPERTIES = {
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "max-height",
    "transform",
    "scale",
    "flex-basis",
    "padding",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "font-size",
    "gap",
    "row-gap",
    "column-gap",
}

def should_route_artifact_edit_to_anthropic(
    request_mode: str,
    artifact_context: dict[str, Any],
    original_edit_request: str,
) -> bool:
    if request_mode != "edit":
        return False
    normalized = (original_edit_request or "").strip()
    if not normalized:
        return False
    if is_layout_orientation_artifact_edit_request(normalized):
        return not bool(get_artifact_patch_source_html(artifact_context))
    if is_background_visual_edit_request(normalized):
        if artifact_edit_request_requires_external_asset_url(normalized):
            return False
        return not bool(get_artifact_patch_source_html(artifact_context))
    return classify_artifact_edit_request_scope(normalized) in {
        "broad",
        "structural_local",
    }

def should_use_anthropic_for_artifact_patch_edit(
    request_mode: str, original_edit_request: str
) -> bool:
    if request_mode != "edit":
        return False
    normalized = (original_edit_request or "").strip()
    if not normalized or artifact_edit_request_requires_external_asset_url(normalized):
        return False
    return is_background_visual_edit_request(normalized)

def should_attempt_artifact_patch_edit(
    request_mode: str, artifact_context: dict[str, Any], original_edit_request: str
) -> bool:
    if request_mode not in {"edit", "repair"}:
        return False
    current_html = get_artifact_patch_source_html(artifact_context)
    if not current_html:
        return False
    normalized_html = current_html.strip()
    if len(normalized_html) > ARTIFACT_PATCH_HTML_CHAR_LIMIT:
        return False
    if "<!-- artifact-context-cut -->" in normalized_html:
        return False
    if not (original_edit_request or "").strip():
        return False
    if classify_artifact_edit_request_scope(original_edit_request) == "broad":
        return False
    return True

def build_artifact_patch_edit_prompt(
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
    _raw_style_overrides = artifact_context.get("styleOverrides") or artifact_context.get(
        "style_overrides"
    )
    style_overrides_block = format_style_overrides_for_prompt(_raw_style_overrides)
    is_background_edit = is_background_visual_edit_request(original_edit_request)
    is_layout_orientation_edit = is_layout_orientation_artifact_edit_request(
        original_edit_request
    )
    is_title_text_edit = is_title_text_artifact_edit_request(original_edit_request)
    is_title_overlap_spacing_edit = is_title_overlap_spacing_artifact_edit_request(
        original_edit_request
    )
    requested_layout_orientation = infer_requested_artifact_layout_orientation(
        original_edit_request
    )
    is_city_background_edit = is_city_background_edit_request(original_edit_request)
    requires_external_asset_url = artifact_edit_request_requires_external_asset_url(
        original_edit_request
    )
    style_selector_candidates = extract_artifact_style_rule_selectors(current_html)
    background_selector_candidates = prefer_selectors_with_existing_css_rule(
        extract_artifact_background_selector_candidates(current_html),
        style_selector_candidates,
    )
    layout_selector_candidates = prefer_selectors_with_existing_css_rule(
        extract_artifact_layout_selector_candidates(current_html),
        style_selector_candidates,
    )
    title_selector_candidates = prefer_selectors_with_existing_css_rule(
        extract_artifact_title_selector_candidates(current_html),
        style_selector_candidates,
    )
    scene_root_selector_candidates = prefer_selectors_with_existing_css_rule(
        extract_artifact_scene_root_selector_candidates(current_html),
        style_selector_candidates,
    )
    background_style_snippets = extract_artifact_background_style_snippets(current_html)
    selector_context_map = build_selector_context_map(current_html)
    return "\n".join(
        [
            "Artifact patch edit task",
            "Apply the user request with minimal edits to the current artifact.",
            "Do not redesign the scene. Preserve unrelated markup exactly.",
            f"Original user edit request: {original_edit_request}",
            (
                "Artifact package target files: "
                f"{ARTIFACT_PACKAGE_ENTRY_FILE}, "
                f"{ARTIFACT_PACKAGE_STYLES_FILE}, "
                f"{ARTIFACT_PACKAGE_RENDERER_FILE}."
            ),
            f"Current artifact type: {artifact_type}" if artifact_type else "",
            f"Current design guidelines: {design_guidelines}" if design_guidelines else "",
            f"Live poll title: {poll_title}" if poll_title else "",
            style_overrides_block,
            (
                "If runtime user style overrides are listed above, the user's description of colors or text "
                "may refer to that effective view. Apply edits so the resulting artifact matches that intent; "
                "after your patch, the host will clear conflicting manual HTML overrides for poll fields."
                if style_overrides_block
                else ""
            ),
            (
                "This is a background/time-of-day/lighting request. Modify only background, sky, ambient, backdrop, and closely related color/lighting styles. Do not change cars, foreground gameplay visuals, labels, icons, or decorative detail."
                if is_background_edit
                else ""
            ),
            (
                "This is a city/urban background request without a direct image URL. Keep it CSS-only: use the existing background layer to suggest a cityscape, skyline, urban lighting, haze, or architecture silhouette. Do not swap in a random photo, do not use a blank white fill, and do not touch the cars."
                if is_city_background_edit and not requires_external_asset_url
                else ""
            ),
            (
                "This is an orientation/alignment request. Keep the same concept and visuals, but switch poll option layout orientation using local CSS changes only."
                if is_layout_orientation_edit
                else ""
            ),
            (
                f"Requested poll layout orientation: {requested_layout_orientation}."
                if is_layout_orientation_edit and requested_layout_orientation
                else ""
            ),
            (
                "This is a title/label readability-overlap request. Keep the artifact design intact and apply local CSS fixes only (title z-index/layering and spacing between title and option rows)."
                if is_title_overlap_spacing_edit
                else ""
            ),
            (
                "This request appears to need a new external image or asset URL. If the user did not provide a direct URL, do not guess one. Return an empty edits array and explain that a direct image URL is required."
                if requires_external_asset_url
                else ""
            ),
            (
                "Available exact background selectors in the current artifact: "
                + ", ".join(background_selector_candidates)
                if background_selector_candidates
                else ""
            ),
            (
                "Available exact scene-root selectors in the current artifact: "
                + ", ".join(scene_root_selector_candidates)
                if scene_root_selector_candidates
                else ""
            ),
            (
                "Available exact layout selectors in the current artifact: "
                + ", ".join(layout_selector_candidates)
                if layout_selector_candidates
                else ""
            ),
            (
                "Available exact title/heading selectors in the current artifact: "
                + ", ".join(title_selector_candidates)
                if is_title_text_edit and title_selector_candidates
                else ""
            ),
            (
                "For background edits, if you use set_css_property, the selector must match one of the available exact background selectors above. Do not invent selectors."
                if background_selector_candidates
                else ""
            ),
            (
                "For layout-orientation edits, target the exact layout selectors above and prefer flex-direction/grid-flow changes over HTML rewrites. Do not invent selectors."
                if is_layout_orientation_edit and layout_selector_candidates
                else ""
            ),
            (
                "For title/label overlap fixes, target only the exact title/heading selectors above and nearby options container selectors. Do not invent selectors like #header unless present."
                if is_title_text_edit
                else ""
            ),
            (
                "If no dedicated background selector fits, use the existing scene-root selectors above as the safe fallback target instead of inventing a new selector."
                if scene_root_selector_candidates
                else ""
            ),
            (
                "Relevant current background CSS snippets:\n"
                + "\n\n".join(background_style_snippets)
                if background_style_snippets
                else ""
            ),
            "Use the fewest edits possible.",
            "Prefer set_css_property for local visual changes.",
            f"For set_css_property, target file `{ARTIFACT_PACKAGE_STYLES_FILE}`.",
            "Do not rename or remove live poll hooks, ids, classes, or data attributes relied on by the existing artifact.",
            "If patch mode is not suitable for this request, return an empty edits array.",
            (
                "IMPORTANT: Below is a selector reference map showing each CSS selector and its CURRENT sizing/layout properties. "
                "Use this to identify the CORRECT selector for the user's request. "
                "A child selector (e.g. `.lego-brick .stud`) is a sub-element, NOT the parent. "
                "When the user refers to an element (e.g. 'the bricks', 'the polls', 'the title'), "
                "target the selector that owns the primary sizing properties for that element, not its children or decorations.\n"
                "CRITICAL for percentage/scaling edits: The values below are the CURRENT live values. "
                "When the user asks to 'increase by 50%', compute the new value from the CURRENT value shown here, "
                "NOT from any original or default value. For example, if width is currently 99px and user says 'increase by 50%', "
                "the new value must be 148.5px (99 * 1.5), NOT 99px. "
                "Never send a value that equals the current value — that would be a no-op.\n"
                "Selector reference map:\n" + selector_context_map
                if selector_context_map
                else ""
            ),
            "Current artifact HTML:",
            current_html,
        ]
    )

def normalize_artifact_patch_plan(raw_text: str) -> dict[str, Any]:
    return normalize_artifact_patch_plan_payload(raw_text)

def apply_artifact_patch_plan(html: str, plan: dict[str, Any]) -> tuple[str, list[str]]:
    patched_html, _patched_package, issues = apply_artifact_patch_plan_to_package(
        html=html,
        artifact_package=None,
        plan=plan,
    )
    return patched_html, issues

def apply_string_artifact_patch_edit(
    html: str, edit_type: str, edit: dict[str, Any]
) -> tuple[str, str]:
    working = html
    if edit_type == "replace_once":
        find = edit.get("find")
        replace = edit.get("replace")
        if not isinstance(find, str) or not find:
            return working, "is missing a non-empty `find` string."
        if not isinstance(replace, str):
            return working, "is missing a `replace` string."
        position = working.find(find)
        if position < 0:
            return working, "could not find the requested exact replacement target."
        return working.replace(find, replace, 1), ""

    if edit_type == "replace_all":
        find = edit.get("find")
        replace = edit.get("replace")
        if not isinstance(find, str) or not find:
            return working, "is missing a non-empty `find` string."
        if not isinstance(replace, str):
            return working, "is missing a `replace` string."
        if find not in working:
            return working, "could not find the requested exact replacement target."
        return working.replace(find, replace), ""

    if edit_type == "replace_between":
        start = edit.get("start")
        end = edit.get("end")
        content = edit.get("content")
        if not isinstance(start, str) or not start:
            return working, "is missing a non-empty `start` string."
        if not isinstance(end, str) or not end:
            return working, "is missing a non-empty `end` string."
        if not isinstance(content, str):
            return working, "is missing a `content` string."
        start_pos = working.find(start)
        if start_pos < 0:
            return working, "could not find the requested replace_between start anchor."
        content_start = start_pos + len(start)
        end_pos = working.find(end, content_start)
        if end_pos < 0:
            return working, "could not find the requested replace_between end anchor."
        return f"{working[:content_start]}{content}{working[end_pos:]}", ""

    if edit_type == "insert_before":
        anchor = edit.get("anchor")
        content = edit.get("content")
        if not isinstance(anchor, str) or not anchor:
            return working, "is missing a non-empty `anchor` string."
        if not isinstance(content, str) or not content:
            return working, "is missing a non-empty `content` string."
        position = working.find(anchor)
        if position < 0:
            return working, "could not find the requested insert_before anchor."
        return f"{working[:position]}{content}{working[position:]}", ""

    if edit_type == "insert_after":
        anchor = edit.get("anchor")
        content = edit.get("content")
        if not isinstance(anchor, str) or not anchor:
            return working, "is missing a non-empty `anchor` string."
        if not isinstance(content, str) or not content:
            return working, "is missing a non-empty `content` string."
        position = working.find(anchor)
        if position < 0:
            return working, "could not find the requested insert_after anchor."
        insert_at = position + len(anchor)
        return f"{working[:insert_at]}{content}{working[insert_at:]}", ""

    if edit_type == "remove_once":
        find = edit.get("find")
        if not isinstance(find, str) or not find:
            return working, "is missing a non-empty `find` string."
        position = working.find(find)
        if position < 0:
            return working, "could not find the requested removal target."
        return working.replace(find, "", 1), ""

    return working, f"used unsupported type `{edit_type}`."

def _inject_overflow_visible_for_clipped_elements(
    edits: list[dict[str, Any]],
    current_html: str,
) -> list[dict[str, Any]]:
    """When the LLM sets z-index on element X, but X's CSS parent has
    ``overflow: hidden``, the z-index change won't help — the element is
    clipped.  Detect this and auto-inject ``overflow: visible`` on the
    ancestor that's doing the clipping.

    Uses simple CSS selector nesting heuristics: if selector ``.pot-lid``
    is targeted with a z-index edit and ``.option-row`` has
    ``overflow: hidden``, we check whether ``.pot-lid`` is likely a child
    of ``.option-row`` by looking at the HTML for nesting.
    """
    zindex_selectors: set[str] = set()
    for edit in edits:
        if not isinstance(edit, dict):
            continue
        if str(edit.get("type") or "").strip().lower() != "set_css_property":
            continue
        if str(edit.get("property") or "").strip().lower() == "z-index":
            zindex_selectors.add(str(edit.get("selector") or "").strip())

    if not zindex_selectors:
        return edits

    prop_map = _extract_css_property_map_from_html(current_html)
    overflow_hidden_selectors: dict[str, str] = {}
    for selector, declarations in prop_map.items():
        for prop_name, prop_value in declarations:
            if (
                prop_name.strip().lower() == "overflow"
                and prop_value.strip().lower() == "hidden"
            ):
                overflow_hidden_selectors[selector] = selector
                break

    if not overflow_hidden_selectors:
        return edits

    injected: list[dict[str, Any]] = []
    already_injected: set[str] = set()
    lower_html = current_html.lower()

    for zindex_sel in zindex_selectors:
        zindex_class = _extract_first_class(zindex_sel)
        if not zindex_class:
            continue
        for overflow_sel in overflow_hidden_selectors:
            overflow_class = _extract_first_class(overflow_sel)
            if not overflow_class or overflow_class == zindex_class:
                continue
            if _html_suggests_parent_child(
                lower_html, overflow_class, zindex_class
            ):
                if overflow_sel not in already_injected:
                    injected.append(
                        {
                            "type": "set_css_property",
                            "file": "styles.css",
                            "selector": overflow_sel,
                            "property": "overflow",
                            "value": "visible",
                        }
                    )
                    already_injected.add(overflow_sel)

    if not injected:
        return edits
    return injected + edits

def _extract_first_class(selector: str) -> str:
    """Extract the first class name from a CSS selector, e.g. '.option-row' → 'option-row'."""
    match = re.search(r"\.([a-zA-Z_][\w-]*)", selector)
    return match.group(1) if match else ""

def _html_suggests_parent_child(
    lower_html: str, parent_class: str, child_class: str
) -> bool:
    """Rough heuristic: check if any element with *parent_class* contains
    an element with *child_class* within ~2000 characters.  Not precise,
    but good enough for common cases.
    """
    parent_pattern = f'class="[^"]*{re.escape(parent_class)}[^"]*"'
    for match in re.finditer(parent_pattern, lower_html):
        start = match.end()
        window = lower_html[start : start + 2000]
        if child_class in window:
            return True
    return False

def rewrite_artifact_patch_plan_for_current_html(
    *,
    plan: dict[str, Any],
    current_html: str,
    original_edit_request: str,
) -> dict[str, Any]:
    """Thin safety-net that fixes hallucinated selectors, deduplicates, and
    caps the edit count.  Intentionally does NOT reclassify the request or
    remap selectors by domain — the LLM's plan is trusted as-is, with only
    fuzzy matching to recover from selector typos / hallucinations.
    """

    assistant_message = (
        plan.get("assistantMessage") if isinstance(plan.get("assistantMessage"), str) else ""
    )
    edits = plan.get("edits") if isinstance(plan.get("edits"), list) else []
    rewritten: list[dict[str, Any]] = []

    style_selector_candidates = extract_artifact_style_rule_selectors(current_html)
    style_selector_set = set(style_selector_candidates)

    for raw_edit in edits:
        if not isinstance(raw_edit, dict):
            continue
        edit = dict(raw_edit)
        edit_type = str(edit.get("type") or "").strip().lower()
        if edit_type != "set_css_property":
            rewritten.append(edit)
            continue
        selector = str(edit.get("selector") or "").strip()

        # --- Fuzzy selector matching ---
        # If the LLM hallucinated a selector that doesn't exist in the
        # stylesheet, try to find the closest real selector.
        # Skip pseudo-selectors (::before, ::after) — those are handled by
        # the CSS tree's dedicated insertion path and must not be collapsed
        # to their base selector.
        if (
            selector
            and selector not in style_selector_set
            and not _PSEUDO_SELECTOR_RE.search(selector)
        ):
            match_result = find_best_selector_match(
                selector, style_selector_candidates
            )
            if match_result.strategy != "none" and match_result.matched_selector:
                edit["selector"] = match_result.matched_selector

        rewritten.append(edit)

    rewritten = _inject_overflow_visible_for_clipped_elements(
        rewritten, current_html
    )

    compacted = compact_artifact_patch_plan_edits(
        rewritten,
        original_edit_request=original_edit_request,
        max_edits=ARTIFACT_PATCH_CANDIDATE_MAX_EDITS,
    )
    return {"assistantMessage": assistant_message, "edits": compacted}

def compact_artifact_patch_plan_edits(
    edits: list[dict[str, Any]],
    *,
    original_edit_request: str,
    max_edits: int,
) -> list[dict[str, Any]]:
    """Normalise, deduplicate, and cap the edit list.

    Deduplication keeps the *last* edit for each (file, selector, property)
    triple.  When the list exceeds *max_edits*, earlier edits are kept
    (preserving the LLM's intended order).
    """
    if not edits:
        return []
    if max_edits <= 0:
        return []

    normalized_edits: list[dict[str, Any]] = []
    dedup_index_by_key: dict[tuple[str, str, str], int] = {}
    for raw_edit in edits:
        if not isinstance(raw_edit, dict):
            continue
        edit_type = str(raw_edit.get("type") or "").strip().lower()

        if edit_type == "set_css_property":
            selector = str(raw_edit.get("selector") or "").strip()
            property_name = str(raw_edit.get("property") or "").strip()
            value = str(raw_edit.get("value") or "").strip()
            if not selector or not property_name or not value:
                continue
            normalized_edit = dict(raw_edit)
            normalized_edit["type"] = "set_css_property"
            normalized_edit["selector"] = selector
            normalized_edit["property"] = property_name
            normalized_edit["value"] = value
            file_name = str(raw_edit.get("file") or ARTIFACT_PACKAGE_STYLES_FILE).strip()
            normalized_edit["file"] = file_name or ARTIFACT_PACKAGE_STYLES_FILE
            dedup_key = (
                normalized_edit["file"].lower(),
                selector.lower(),
                property_name.lower(),
            )
            existing_index = dedup_index_by_key.get(dedup_key)
            if existing_index is not None:
                normalized_edits[existing_index] = normalized_edit
                continue
            dedup_index_by_key[dedup_key] = len(normalized_edits)
            normalized_edits.append(normalized_edit)

        elif edit_type == "insert_css_rule":
            selector = str(raw_edit.get("selector") or "").strip()
            css_body = str(raw_edit.get("css") or "").strip()
            if not selector or not css_body:
                continue
            normalized_edit = dict(raw_edit)
            normalized_edit["type"] = "insert_css_rule"
            normalized_edit["selector"] = selector
            normalized_edit["css"] = css_body
            normalized_edits.append(normalized_edit)

        elif edit_type == "insert_html":
            target = str(raw_edit.get("target") or "").strip()
            snippet = str(raw_edit.get("html") or "").strip()
            if not target or not snippet:
                continue
            normalized_edit = dict(raw_edit)
            normalized_edit["type"] = "insert_html"
            normalized_edit["target"] = target
            normalized_edit["html"] = snippet
            normalized_edits.append(normalized_edit)

        else:
            continue

    # Truncate to max_edits, preserving original order.
    return normalized_edits[:max_edits]

def score_artifact_patch_edit_priority(
    edit: dict[str, Any], *, original_edit_request: str, is_title_request: bool
) -> int:
    selector = str(edit.get("selector") or "").strip().lower()
    property_name = str(edit.get("property") or "").strip().lower()
    value = str(edit.get("value") or "").strip().lower()
    request_text = (original_edit_request or "").strip().lower()
    (
        has_title_decoration_intent,
        has_dense_title_decoration_intent,
    ) = infer_title_decoration_intent(request_text)
    requested_title_color_tokens = extract_title_requested_color_tokens(request_text)
    mentions_dense_pattern = bool(
        re.search(r"\b(?:more|many|extra|fill|filled|across|full|entire|whole|dense|packed|repeat|repeating|row|rows)\b", request_text)
    )
    score = 0

    if is_title_request:
        if is_title_like_selector(selector):
            score += 45
        if "::before" in selector or "::after" in selector:
            score += 26
            if has_title_decoration_intent:
                score += 36
                if property_name in {"content", "background", "border-radius", "box-shadow"}:
                    score += 18
                if has_dense_title_decoration_intent and property_name in {
                    "box-shadow",
                    "background",
                    "background-color",
                    "background-image",
                    "background-size",
                    "background-repeat",
                    "width",
                    "height",
                }:
                    score += 24
        if re.search(
            r"\b(?:container|box|badge|pill|frame|card|capsule|panel|brick)\b",
            request_text,
            re.IGNORECASE,
        ):
            if property_name in {
                "background",
                "border",
                "border-radius",
                "box-shadow",
                "padding",
                "margin",
                "position",
                "content",
                "width",
                "height",
                "top",
                "left",
                "right",
                "bottom",
                "z-index",
            }:
                score += 20
        if has_title_decoration_intent and property_name in {
            "content",
            "box-shadow",
            "background",
            "background-color",
            "background-image",
            "background-size",
            "background-repeat",
            "top",
            "left",
            "right",
            "bottom",
            "transform",
            "opacity",
        }:
            score += 14
        if has_title_decoration_intent and mentions_dense_pattern and property_name in {
            "box-shadow",
            "background-image",
            "background-size",
            "background-repeat",
            "width",
            "height",
        }:
            score += 10
        if requested_title_color_tokens and (
            property_name in {"color", "background", "background-color", "border-color", "box-shadow"}
            or any(
                color_token_matches_css_text(value, color_token)
                for color_token in requested_title_color_tokens
            )
        ):
            score += 12

    if property_name in {"content", "background", "border-radius", "box-shadow"}:
        score += 8
    if property_name in {"padding", "margin", "z-index", "position"}:
        score += 5
    return score

def _format_debug_edit(edit: dict[str, Any]) -> str:
    """Format a single edit for debug output."""
    edit_type = edit.get("type", "")
    if edit_type == "set_css_property":
        return f"{edit_type} | {edit.get('selector','')} | {edit.get('property','')} = {edit.get('value','')}"
    if edit_type == "insert_css_rule":
        css_preview = str(edit.get("css", ""))[:80]
        return f"{edit_type} | {edit.get('selector','')} | {css_preview}"
    if edit_type == "insert_html":
        html_preview = str(edit.get("html", ""))[:80]
        return f"{edit_type} | target={edit.get('target','')} pos={edit.get('position','beforeend')} | {html_preview}"
    return f"{edit_type} | {edit}"

def _build_debug_patch_plan(
    raw_text: str,
    raw_plan: dict[str, Any],
    rewritten_plan: dict[str, Any],
) -> str:
    """Build a human-readable debug summary of the patch pipeline."""

    parts: list[str] = []
    parts.append("=== RAW LLM OUTPUT ===")
    parts.append(raw_text[:4000] if len(raw_text) > 4000 else raw_text)

    raw_edits = raw_plan.get("edits") if isinstance(raw_plan.get("edits"), list) else []
    rewritten_edits = rewritten_plan.get("edits") if isinstance(rewritten_plan.get("edits"), list) else []

    parts.append("")
    parts.append(f"=== PARSED PLAN ({len(raw_edits)} edits) ===")
    for i, edit in enumerate(raw_edits):
        parts.append(f"  #{i+1}: {_format_debug_edit(edit)}")

    if raw_edits != rewritten_edits:
        parts.append("")
        parts.append(f"=== REWRITTEN PLAN ({len(rewritten_edits)} edits) ===")
        for i, edit in enumerate(rewritten_edits):
            parts.append(f"  #{i+1}: {_format_debug_edit(edit)}")
    else:
        parts.append("")
        parts.append("=== REWRITTEN PLAN: (no changes from parsed) ===")

    return "\n".join(parts)

def apply_artifact_patch_plan_progressively(
    *,
    current_html: str,
    current_package: dict[str, Any] | None,
    plan: dict[str, Any],
    original_edit_request: str,
    context: dict[str, Any],
) -> tuple[str, dict[str, Any] | None, list[str]]:
    raw_edits = plan.get("edits") if isinstance(plan.get("edits"), list) else []
    if not raw_edits:
        return "", current_package, ["patch plan did not include any edits."]

    candidate_edits = compact_artifact_patch_plan_edits(
        [edit for edit in raw_edits if isinstance(edit, dict)],
        original_edit_request=original_edit_request,
        max_edits=ARTIFACT_PATCH_CANDIDATE_MAX_EDITS,
    )
    if not candidate_edits:
        return "", current_package, ["patch plan did not include any applicable edits."]

    working_html = current_html
    working_package = current_package
    applied_any_batch = False
    batch_issues: list[str] = []

    for batch_index, batch_edits in enumerate(
        chunk_artifact_patch_plan_edits(candidate_edits, ARTIFACT_PATCH_BATCH_SIZE)
    ):
        if batch_index >= ARTIFACT_PATCH_MAX_BATCHES:
            break
        if not batch_edits:
            continue
        batch_plan = {"assistantMessage": "", "edits": batch_edits}
        patched_html, patched_package, issues = apply_artifact_patch_plan_to_package(
            html=working_html,
            artifact_package=working_package,
            plan=batch_plan,
        )
        if issues:
            batch_issues.extend(issues)
            continue
        candidate_html = restore_artifact_live_hooks_if_missing(patched_html, context)
        candidate_html = attempt_artifact_structural_autorepair(candidate_html)
        validation_issues = validate_poll_game_artifact_html(candidate_html)
        if validation_issues:
            batch_issues.extend(validation_issues)
            continue
        working_html = candidate_html
        working_package = build_segmented_artifact_package(candidate_html, patched_package)
        applied_any_batch = True

    if applied_any_batch:
        return working_html, working_package, []

    deduped_issues = dedupe_patch_issue_list(batch_issues)
    if deduped_issues:
        return "", current_package, deduped_issues[:3]
    return "", current_package, ["patch plan did not change the artifact html."]

def chunk_artifact_patch_plan_edits(
    edits: list[dict[str, Any]], batch_size: int
) -> list[list[dict[str, Any]]]:
    size = max(1, batch_size)
    return [edits[index : index + size] for index in range(0, len(edits), size)]

def infer_artifact_completion_requirements(original_edit_request: str) -> list[str]:
    normalized = (original_edit_request or "").strip().lower()
    requirements = infer_artifact_patch_satisfaction_requirements(original_edit_request)
    if not normalized:
        return requirements
    has_scale_intent = bool(
        ARTIFACT_SCALE_INTENT_RE.search(normalized)
        or ARTIFACT_SCALE_AMOUNT_RE.search(normalized)
    )
    if not has_scale_intent:
        return requirements
    mentions_poll_target = bool(ARTIFACT_SCALE_POLL_TARGET_RE.search(normalized))
    mentions_unit_target = bool(
        ARTIFACT_SCALE_UNIT_TARGET_RE.search(normalized)
        or ARTIFACT_SCALE_INSIDE_POLL_RE.search(normalized)
    )
    if mentions_poll_target:
        requirements.append("poll_visual_scale")
    if mentions_unit_target or (mentions_poll_target and " and " in normalized):
        requirements.append("poll_unit_scale")
    deduped: list[str] = []
    seen: set[str] = set()
    for requirement in requirements:
        if requirement in seen:
            continue
        seen.add(requirement)
        deduped.append(requirement)
    return deduped

def evaluate_artifact_completion_requirements(
    *,
    requirements: list[str],
    before_html: str,
    after_html: str,
) -> tuple[bool, list[str]]:
    if not requirements:
        return True, []

    missing: list[str] = []
    patch_requirements = [
        requirement
        for requirement in requirements
        if requirement not in {"poll_visual_scale", "poll_unit_scale"}
    ]
    if patch_requirements:
        patch_satisfied, patch_missing = evaluate_artifact_patch_satisfaction(
            requirements=patch_requirements,
            html=after_html,
        )
        if not patch_satisfied:
            missing.extend(patch_missing)

    scale_requirements = [
        requirement
        for requirement in requirements
        if requirement in {"poll_visual_scale", "poll_unit_scale"}
    ]
    if scale_requirements:
        changed_poll_scale_selectors = collect_changed_scale_selectors(
            before_html=before_html,
            after_html=after_html,
            selector_matcher=is_poll_scale_selector,
        )
        changed_unit_scale_selectors = collect_changed_scale_selectors(
            before_html=before_html,
            after_html=after_html,
            selector_matcher=is_poll_unit_scale_selector,
        )
        if (
            "poll_visual_scale" in scale_requirements
            and not changed_poll_scale_selectors
        ):
            missing.append("poll_visual_scale")
        if "poll_unit_scale" in scale_requirements and not changed_unit_scale_selectors:
            missing.append("poll_unit_scale")

    deduped: list[str] = []
    seen: set[str] = set()
    for requirement in missing:
        normalized = (requirement or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return len(deduped) == 0, deduped

def collect_changed_scale_selectors(
    *,
    before_html: str,
    after_html: str,
    selector_matcher: Callable[[str], bool],
) -> set[str]:
    before_map = extract_artifact_css_declaration_map(before_html)
    after_map = extract_artifact_css_declaration_map(after_html)
    changed: set[str] = set()
    for (selector, property_name), after_value in after_map.items():
        if property_name not in ARTIFACT_SCALE_CSS_PROPERTIES:
            continue
        if not selector_matcher(selector):
            continue
        before_value = before_map.get((selector, property_name))
        if normalize_css_value_for_match(before_value) != normalize_css_value_for_match(
            after_value
        ):
            changed.add(selector)
    return changed

def extract_artifact_css_declaration_map(
    html: str,
) -> dict[tuple[str, str], str]:
    css_text = extract_combined_artifact_css_text(html)
    selectors = extract_artifact_style_rule_selectors(html)
    declarations: dict[tuple[str, str], str] = {}
    for selector in selectors:
        selector_bodies = extract_css_rule_bodies_for_selector(css_text, selector)
        normalized_selector = selector.strip().lower()
        if not normalized_selector:
            continue
        for body in selector_bodies:
            for declaration in (body or "").split(";"):
                if ":" not in declaration:
                    continue
                property_name, value = declaration.split(":", 1)
                normalized_property = property_name.strip().lower()
                normalized_value = value.strip()
                if not normalized_property:
                    continue
                declarations[(normalized_selector, normalized_property)] = normalized_value
    return declarations

def normalize_css_value_for_match(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())

def is_poll_scale_selector(selector: str) -> bool:
    normalized = (selector or "").strip().lower()
    if not normalized or normalized in {"body", "html"}:
        return False
    if is_layout_like_selector(normalized):
        return True
    return bool(ARTIFACT_SCALE_POLL_TARGET_RE.search(normalized))

def is_poll_unit_scale_selector(selector: str) -> bool:
    normalized = (selector or "").strip().lower()
    if not normalized:
        return False
    if ARTIFACT_SCALE_UNIT_TARGET_RE.search(normalized):
        return True
    if "::before" in normalized or "::after" in normalized:
        return bool(
            re.search(
                r"(option|poll|vote|bar|lane|row|column|chip|piece|unit|block|brick)",
                normalized,
            )
        )
    return bool(
        re.search(
            r"(option|poll|vote|bar|lane|row|column).*(item|chip|piece|unit|block|brick)",
            normalized,
        )
    )

def infer_artifact_patch_satisfaction_requirements(
    original_edit_request: str,
) -> list[str]:
    normalized = (original_edit_request or "").strip().lower()
    if not normalized:
        return []
    requirements: list[str] = []
    if is_layout_orientation_artifact_edit_request(normalized):
        requested_orientation = infer_requested_artifact_layout_orientation(normalized)
        if requested_orientation == "vertical":
            requirements.append("layout_vertical")
        elif requested_orientation == "horizontal":
            requirements.append("layout_horizontal")
    if is_title_overlap_spacing_artifact_edit_request(normalized):
        requirements.append("title_spacing")
    if is_title_text_artifact_edit_request(normalized):
        mentions_container = bool(
            re.search(
                r"\b(?:container|box|badge|pill|frame|card|capsule|panel|brick|lego)\b",
                normalized,
            )
        )
        explicit_container_wrap = request_explicitly_wraps_title_in_container(normalized)
        decoration_only_request = is_title_decoration_only_request(normalized)
        if mentions_container and (explicit_container_wrap or not decoration_only_request):
            requirements.append("title_container")
        has_title_decoration_intent, has_dense_title_decoration_intent = (
            infer_title_decoration_intent(normalized)
        )
        if has_title_decoration_intent:
            requirements.append("title_top_decoration")
        if has_dense_title_decoration_intent:
            requirements.append("title_top_decoration_dense")
        for color_token in extract_title_requested_color_tokens(normalized):
            requirements.append(f"title_requested_color::{color_token}")
    deduped: list[str] = []
    seen: set[str] = set()
    for requirement in requirements:
        if requirement in seen:
            continue
        seen.add(requirement)
        deduped.append(requirement)
    return deduped

def map_color_keyword_to_family(color_keyword: str) -> str:
    normalized = (color_keyword or "").strip().lower()
    family_map = {
        "red": "red",
        "maroon": "red",
        "orange": "orange",
        "yellow": "yellow",
        "gold": "yellow",
        "amber": "yellow",
        "green": "green",
        "lime": "green",
        "olive": "green",
        "teal": "cyan",
        "cyan": "cyan",
        "turquoise": "cyan",
        "blue": "blue",
        "navy": "blue",
        "indigo": "purple",
        "violet": "purple",
        "purple": "purple",
        "magenta": "pink",
        "pink": "pink",
        "brown": "brown",
        "beige": "brown",
        "gray": "gray",
        "grey": "gray",
        "silver": "gray",
        "black": "black",
        "white": "white",
    }
    return family_map.get(normalized, "")

def classify_rgb_color_family(red: int, green: int, blue: int) -> str:
    red = max(0, min(255, int(red)))
    green = max(0, min(255, int(green)))
    blue = max(0, min(255, int(blue)))
    max_channel = max(red, green, blue)
    min_channel = min(red, green, blue)
    channel_delta = max_channel - min_channel
    if max_channel <= 28:
        return "black"
    if min_channel >= 235 and channel_delta <= 18:
        return "white"
    if channel_delta <= 20:
        return "gray"

    hue, saturation, value = colorsys.rgb_to_hsv(red / 255.0, green / 255.0, blue / 255.0)
    hue_deg = hue * 360.0
    if saturation < 0.12:
        return "gray"
    if 15 <= hue_deg < 45 and value < 0.68:
        return "brown"
    if hue_deg < 15 or hue_deg >= 345:
        return "red"
    if hue_deg < 45:
        return "orange"
    if hue_deg < 70:
        return "yellow"
    if hue_deg < 170:
        return "green"
    if hue_deg < 200:
        return "cyan"
    if hue_deg < 255:
        return "blue"
    if hue_deg < 300:
        return "purple"
    return "pink"

def parse_css_rgb_component(raw_value: str) -> int | None:
    value = (raw_value or "").strip().lower()
    if not value:
        return None
    if value.endswith("%"):
        try:
            percent = float(value[:-1].strip())
        except ValueError:
            return None
        percent = max(0.0, min(100.0, percent))
        return int(round((percent / 100.0) * 255.0))
    try:
        channel = float(value)
    except ValueError:
        return None
    channel = max(0.0, min(255.0, channel))
    return int(round(channel))

def extract_css_rgb_triplets(css_text: str) -> list[tuple[int, int, int]]:
    rgb_values: list[tuple[int, int, int]] = []
    for hex_color in re.findall(r"#[0-9a-f]{3,8}\b", (css_text or "").lower()):
        if len(hex_color) == 4:
            red = int(hex_color[1] * 2, 16)
            green = int(hex_color[2] * 2, 16)
            blue = int(hex_color[3] * 2, 16)
            rgb_values.append((red, green, blue))
            continue
        if len(hex_color) >= 7:
            red = int(hex_color[1:3], 16)
            green = int(hex_color[3:5], 16)
            blue = int(hex_color[5:7], 16)
            rgb_values.append((red, green, blue))
    for rgb_function in re.findall(
        r"\brgba?\(\s*([^,]+),\s*([^,]+),\s*([^) ,]+)",
        (css_text or "").lower(),
    ):
        red = parse_css_rgb_component(rgb_function[0])
        green = parse_css_rgb_component(rgb_function[1])
        blue = parse_css_rgb_component(rgb_function[2])
        if red is None or green is None or blue is None:
            continue
        rgb_values.append((red, green, blue))
    return rgb_values

def color_token_matches_css_text(css_text: str, color_token: str) -> bool:
    normalized_css_text = (css_text or "").strip().lower()
    normalized_color = normalize_requested_color_token(color_token)
    if not normalized_css_text or not normalized_color:
        return False
    if normalized_color.startswith("#"):
        return normalized_color in normalized_css_text
    if normalized_color.startswith(("rgb(", "rgba(", "hsl(", "hsla(")):
        compact_css = re.sub(r"\s+", "", normalized_css_text)
        return normalized_color in compact_css
    if re.search(rf"\b{re.escape(normalized_color)}\b", normalized_css_text):
        return True
    color_family = map_color_keyword_to_family(normalized_color)
    if not color_family:
        return False
    for red, green, blue in extract_css_rgb_triplets(normalized_css_text):
        if classify_rgb_color_family(red, green, blue) == color_family:
            return True
    return False

def has_requested_title_color_in_css(
    css_text: str, title_selectors: list[str], requested_color: str
) -> bool:
    selectors_to_check: list[str] = []
    for selector in title_selectors:
        selectors_to_check.append(selector)
        selectors_to_check.append(f"{selector}::before")
        selectors_to_check.append(f"{selector}::after")
    for selector in selectors_to_check:
        for body in extract_css_rule_bodies_for_selector(css_text, selector):
            if color_token_matches_css_text(body, requested_color):
                return True
    return color_token_matches_css_text(css_text, requested_color)

def should_accept_partial_patch_satisfaction_result(
    *, requirements: list[str], missing: list[str], html: str
) -> bool:
    if not missing:
        return True
    missing_set = {item.strip() for item in missing if item and item.strip()}
    if not missing_set:
        return True
    allowed_soft_missing = {"title_top_decoration_dense", "title_studs_dense"}
    if not missing_set.issubset(allowed_soft_missing):
        return False
    top_decoration_ok, _top_decoration_missing = evaluate_artifact_patch_satisfaction(
        requirements=["title_top_decoration"],
        html=html,
    )
    if not top_decoration_ok:
        return False
    return bool(
        {"title_top_decoration_dense", "title_studs_dense"}
        & set(requirements)
    )

def evaluate_artifact_patch_satisfaction(
    *, requirements: list[str], html: str
) -> tuple[bool, list[str]]:
    if not requirements:
        return True, []
    css_text = extract_combined_artifact_css_text(html)
    title_selectors = [
        selector
        for selector in extract_artifact_title_selector_candidates(html)
        if is_title_like_selector(selector)
    ]
    primary_title_selectors = [
        selector for selector in title_selectors if is_primary_title_selector(selector)
    ]
    if not primary_title_selectors:
        primary_title_selectors = title_selectors
    layout_selectors = extract_artifact_layout_selector_candidates(html)
    missing: list[str] = []
    for requirement in requirements:
        if requirement == "layout_vertical":
            if not any(
                has_css_property_value_for_selector(
                    css_text, selector, "flex-direction", "column"
                )
                for selector in layout_selectors
            ) and not re.search(r"\bflex-direction\s*:\s*column\b", css_text, re.IGNORECASE):
                missing.append(requirement)
            continue
        if requirement == "layout_horizontal":
            if not any(
                has_css_property_value_for_selector(
                    css_text, selector, "flex-direction", "row"
                )
                for selector in layout_selectors
            ) and not re.search(r"\bflex-direction\s*:\s*row\b", css_text, re.IGNORECASE):
                missing.append(requirement)
            continue
        if requirement == "title_spacing":
            has_spacing = any(
                has_css_property_for_selector(css_text, selector, "margin-bottom")
                or has_css_property_for_selector(css_text, selector, "margin-top")
                or has_css_property_for_selector(css_text, selector, "padding-top")
                for selector in primary_title_selectors
            ) or any(
                has_css_property_for_selector(css_text, selector, "margin-top")
                or has_css_property_for_selector(css_text, selector, "gap")
                or has_css_property_for_selector(css_text, selector, "padding-top")
                for selector in layout_selectors
            )
            if not has_spacing:
                missing.append(requirement)
            continue
        if requirement == "title_container":
            has_container = any(
                has_css_property_for_selector(css_text, selector, "background")
                and (
                    has_css_property_for_selector(css_text, selector, "padding")
                    or has_css_property_for_selector(css_text, selector, "border-radius")
                    or has_css_property_for_selector(css_text, selector, "border")
                    or has_css_property_for_selector(css_text, selector, "box-shadow")
                )
                for selector in primary_title_selectors
            )
            if not has_container:
                missing.append(requirement)
            continue
        if requirement in {"title_top_decoration", "title_studs"}:
            if not has_title_top_decoration_selector_rule(
                css_text, primary_title_selectors
            ):
                missing.append(requirement)
            continue
        if requirement in {"title_top_decoration_dense", "title_studs_dense"}:
            if not has_dense_title_top_decoration_selector_rule(
                css_text, primary_title_selectors
            ):
                missing.append(requirement)
            continue
        if requirement == "title_yellow":
            if not has_requested_title_color_in_css(
                css_text,
                primary_title_selectors,
                "yellow",
            ):
                missing.append(requirement)
            continue
        if requirement.startswith("title_requested_color::"):
            requested_color = (
                requirement.split("::", 1)[1].strip()
                if "::" in requirement
                else ""
            )
            if not requested_color:
                continue
            if not has_requested_title_color_in_css(
                css_text,
                primary_title_selectors,
                requested_color,
            ):
                missing.append(requirement)
            continue
    return len(missing) == 0, missing

def has_title_top_decoration_selector_rule(
    css_text: str, title_selectors: list[str]
) -> bool:
    normalized_css = css_text or ""
    for selector in title_selectors:
        for pseudo_selector in (f"{selector}::before", f"{selector}::after"):
            if re.search(
                rf"{re.escape(pseudo_selector)}\s*\{{",
                normalized_css,
                re.IGNORECASE,
            ):
                has_content = has_css_property_for_selector(
                    normalized_css, pseudo_selector, "content"
                )
                has_stud_fill = (
                    has_css_property_for_selector(
                        normalized_css, pseudo_selector, "background"
                    )
                    or has_css_property_for_selector(
                        normalized_css, pseudo_selector, "background-color"
                    )
                    or has_css_property_for_selector(
                        normalized_css, pseudo_selector, "box-shadow"
                    )
                    or has_css_property_for_selector(
                        normalized_css, pseudo_selector, "border"
                    )
                )
                has_size = (
                    (
                        has_css_property_for_selector(
                            normalized_css, pseudo_selector, "width"
                        )
                        or has_css_property_for_selector(
                            normalized_css, pseudo_selector, "inline-size"
                        )
                    )
                    and (
                        has_css_property_for_selector(
                            normalized_css, pseudo_selector, "height"
                        )
                        or has_css_property_for_selector(
                            normalized_css, pseudo_selector, "block-size"
                        )
                    )
                )
                if has_content and has_stud_fill and has_size:
                    return True
    return False

def has_dense_title_top_decoration_selector_rule(
    css_text: str, title_selectors: list[str]
) -> bool:
    normalized_css = css_text or ""
    for selector in title_selectors:
        for pseudo_selector in (f"{selector}::before", f"{selector}::after"):
            for body in extract_css_rule_bodies_for_selector(normalized_css, pseudo_selector):
                if not _is_valid_title_stud_rule_body(body):
                    continue
                if has_dense_repeating_decoration_pattern_in_css_body(body):
                    return True
    return False

def _is_valid_title_stud_rule_body(css_body: str) -> bool:
    lowered = (css_body or "").lower()
    has_content = bool(re.search(r"\bcontent\s*:", lowered))
    has_fill = bool(
        re.search(
            r"\b(?:background|background-color|box-shadow|border)\s*:",
            lowered,
        )
    )
    has_size = bool(
        re.search(r"\b(?:width|inline-size)\s*:", lowered)
        and re.search(r"\b(?:height|block-size)\s*:", lowered)
    )
    return has_content and has_fill and has_size

def has_dense_repeating_decoration_pattern_in_css_body(css_body: str) -> bool:
    lowered = (css_body or "").lower()
    box_shadow_match = re.search(r"\bbox-shadow\s*:\s*([^;]+);", lowered)
    if box_shadow_match:
        if (
            box_shadow_match.group(1).count(",")
            >= TITLE_TOP_DECORATION_DENSE_MIN_BOX_SHADOW_OFFSETS
        ):
            return True
    if "repeating-radial-gradient(" in lowered:
        return True
    if len(re.findall(r"radial-gradient\(", lowered)) >= 4:
        return True
    for background_value in re.findall(
        r"\bbackground(?:-image)?\s*:\s*([^;]+);", lowered
    ):
        if (
            "radial-gradient(" in background_value
            and ("repeat-x" in background_value or "space" in background_value)
        ):
            return True
    return False

def dedupe_patch_issue_list(issues: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for issue in issues:
        normalized = (issue or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped
