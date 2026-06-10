"""CSS selector heuristics for artifact HTML.

Extracts candidate selectors from <style> blocks and scores/chooses the
best candidate for layout, title, scene-root, and background edits.
Extracted from app.api.ai.
"""

from __future__ import annotations

import re
from .artifact_css_edit import ARTIFACT_STYLE_TAG_RE, find_matching_delimiter
from .artifact_css_tree import extract_selector_property_map


def is_background_like_selector(selector: str) -> bool:
    lowered = (selector or "").strip().lower()
    if not lowered:
        return False
    if lowered in {"body", "html"}:
        return True
    if "data-prezo-background-layer" in lowered:
        return True
    return bool(
        re.search(
            r"(?:#|\.|^)(?:[a-z0-9_-]*?(?:bg|background|backdrop|sky|city|scene|track)[a-z0-9_-]*)",
            lowered,
        )
    )

def is_explicit_background_layer_selector(selector: str) -> bool:
    lowered = (selector or "").strip().lower()
    if not lowered:
        return False
    if "data-prezo-background-layer" in lowered or "data-prezo-generated-background-layer" in lowered:
        return True
    return bool(
        re.search(r"(?:bg|background|backdrop|sky|track)", lowered)
    )

def is_layout_like_selector(selector: str) -> bool:
    lowered = (selector or "").strip().lower()
    if not lowered:
        return False
    if lowered in {"body", "html"}:
        return False
    if "::before" in lowered or "::after" in lowered:
        return False
    if "data-prezo-foreground-layer" in lowered:
        return True
    return bool(
        re.search(
            r"(?:option|poll|choice|answer|lane|row|bar|column|stack|vote|result|list|grid|rank)",
            lowered,
        )
    )

def extract_artifact_style_rule_selectors(html: str) -> list[str]:
    selectors: list[str] = []
    seen: set[str] = set()

    for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = style_match.group("body") or ""
        for raw_selector in re.findall(r"(^|})\s*([^{}]+)\{", style_body, re.MULTILINE):
            selector_text = raw_selector[1].strip()
            # Strip CSS comments that the regex may have captured as part
            # of the selector text (e.g. "/* comment */\n  .selector").
            selector_text = re.sub(r"/\*.*?\*/", "", selector_text, flags=re.DOTALL).strip()
            if not selector_text or selector_text.startswith("@"):
                continue
            for selector in selector_text.split(","):
                normalized = selector.strip()
                if not normalized or normalized in seen:
                    continue
                seen.add(normalized)
                selectors.append(normalized)
    return selectors

def build_selector_context_map(html: str, *, max_selectors: int = 40) -> str:
    """Build a concise summary of every CSS selector and its key sizing/layout
    properties in the artifact.  This is injected into the patch prompt so the
    LLM can see *which selector controls what* without having to parse the
    full HTML/CSS itself.

    Output looks like::

        .lego-brick  →  width: 66px; height: 40px
        .lego-brick .stud  →  width: 12px; height: 12px; top: -5px
        .brick-track  →  width: 74px; min-height: 180px
    """
    # Collect CSS from all <style> blocks.
    css_chunks: list[str] = []
    for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        css_chunks.append(style_match.group("body") or "")
    if not css_chunks:
        return ""
    full_css = "\n".join(css_chunks)

    prop_map = extract_selector_property_map(full_css)
    if not prop_map:
        return ""

    # Properties worth surfacing (sizing, layout, positioning, visual identity).
    sizing_props = {
        "width", "height", "min-width", "min-height", "max-width", "max-height",
        "flex", "flex-basis", "flex-grow", "flex-shrink", "flex-direction",
        "gap", "row-gap", "column-gap",
        "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
        "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
        "font-size", "display", "position", "top", "left", "right", "bottom",
        "transform", "scale", "border-radius", "overflow",
    }

    lines: list[str] = []
    for selector, declarations in list(prop_map.items())[:max_selectors]:
        # Filter to key properties only to keep the map compact.
        key_props = [
            f"{name}: {value}"
            for name, value in declarations
            if name.strip().lower() in sizing_props
        ]
        if not key_props:
            continue
        lines.append(f"  {selector}  →  {'; '.join(key_props)}")

    if not lines:
        return ""
    return "\n".join(lines)

def _extract_css_property_map_from_html(
    html: str,
) -> dict[str, list[tuple[str, str]]]:
    """Extract a selector → [(property, value), ...] map from all ``<style>``
    blocks in *html*.  Used by the parent-child correction logic to check
    whether a parent selector owns a given CSS property."""
    css_chunks: list[str] = []
    for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        css_chunks.append(style_match.group("body") or "")
    if not css_chunks:
        return {}
    return extract_selector_property_map("\n".join(css_chunks))

def prefer_selectors_with_existing_css_rule(
    candidates: list[str], style_selectors: list[str]
) -> list[str]:
    if not candidates:
        return []
    if not style_selectors:
        return candidates
    style_selector_set = set(style_selectors)
    matched = [candidate for candidate in candidates if candidate in style_selector_set]
    return matched if matched else candidates

def extract_artifact_layout_selector_candidates(html: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def remember(selector: str) -> None:
        normalized = selector.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    for selector in (
        "#options",
        "#poll-options",
        "#poll-rows",
        "#lanes",
        ".options",
        ".poll-options",
        ".poll-rows",
        ".choices",
        ".answers",
        ".lanes",
        ".rows",
        ".bars",
        ".columns",
        ".option-list",
        ".poll-list",
    ):
        if re.search(rf"(?<![A-Za-z0-9_-]){re.escape(selector)}(?![A-Za-z0-9_-])", html):
            remember(selector)

    for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = style_match.group("body") or ""
        for raw_selector in re.findall(r"(^|})\s*([^{}]+)\{", style_body, re.MULTILINE):
            selector_text = raw_selector[1].strip()
            if not selector_text or selector_text.startswith("@"):
                continue
            for selector in selector_text.split(","):
                normalized = selector.strip()
                if is_layout_like_selector(normalized):
                    remember(normalized)

    for match in re.finditer(r'id\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        raw_id = match.group(1).strip()
        if raw_id and re.search(
            r"(option|poll|choice|answer|lane|row|bar|column|stack|vote|result|list|grid|rank)",
            raw_id,
            re.IGNORECASE,
        ):
            remember(f"#{raw_id}")

    for match in re.finditer(r'class\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        for raw_class in match.group(1).split():
            if raw_class and re.search(
                r"(option|poll|choice|answer|lane|row|bar|column|stack|vote|result|list|grid|rank)",
                raw_class,
                re.IGNORECASE,
            ):
                remember(f".{raw_class}")

    return candidates[:14]

def score_layout_selector_candidate(
    requested_selector: str, candidate: str
) -> tuple[int, int, int]:
    requested_tokens = set(re.findall(r"[a-z]+", (requested_selector or "").lower()))
    candidate_tokens = set(re.findall(r"[a-z]+", (candidate or "").lower()))
    overlap = len(requested_tokens & candidate_tokens)
    specificity = (
        2
        if candidate.startswith("#")
        else 1
        if candidate.startswith(".") or candidate.startswith("[")
        else 0
    )
    priority_tokens = (
        "options",
        "poll-options",
        "poll-rows",
        "choices",
        "answers",
        "lanes",
        "rows",
        "bars",
        "columns",
        "option",
        "poll",
        "vote",
        "result",
        "list",
        "grid",
        "stack",
        "rank",
    )
    priority = 0
    lowered_candidate = candidate.lower()
    for index, token in enumerate(priority_tokens):
        if token in lowered_candidate:
            priority = len(priority_tokens) - index
            break
    complexity_penalty = -1 if (" " in candidate or ">" in candidate) else 0
    return (overlap, priority, specificity + complexity_penalty)

def choose_layout_selector_candidate(
    requested_selector: str, candidates: list[str]
) -> str:
    if not candidates:
        return ""
    normalized_candidates = [item for item in candidates if is_layout_like_selector(item)]
    if not normalized_candidates:
        return ""
    normalized_requested = (requested_selector or "").strip()
    if normalized_requested in normalized_candidates:
        return normalized_requested
    ranked = sorted(
        normalized_candidates,
        key=lambda candidate: score_layout_selector_candidate(
            normalized_requested, candidate
        ),
        reverse=True,
    )
    return ranked[0] if ranked else ""

def is_title_like_selector(selector: str) -> bool:
    lowered = (selector or "").strip().lower()
    if not lowered:
        return False
    if lowered in {"body", "html"}:
        return False
    if "::before" in lowered or "::after" in lowered:
        return False
    if lowered in {"h1", "h2", "h3", "header"}:
        return True
    return bool(
        re.search(
            r"(?:title|headline|question|header|heading|eyebrow|caption|prompt|label)",
            lowered,
        )
    )

def extract_artifact_title_selector_candidates(html: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def remember(selector: str) -> None:
        normalized = selector.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    for selector in (
        "#header",
        "#title",
        "#question",
        ".header",
        ".poll-header",
        ".title",
        ".poll-title",
        ".question",
        ".headline",
        ".eyebrow",
        "header",
        "h1",
        "h2",
        "h3",
    ):
        if re.search(rf"(?<![A-Za-z0-9_-]){re.escape(selector)}(?![A-Za-z0-9_-])", html):
            remember(selector)

    for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = style_match.group("body") or ""
        for raw_selector in re.findall(r"(^|})\s*([^{}]+)\{", style_body, re.MULTILINE):
            selector_text = raw_selector[1].strip()
            if not selector_text or selector_text.startswith("@"):
                continue
            for selector in selector_text.split(","):
                normalized = selector.strip()
                if is_title_like_selector(normalized):
                    remember(normalized)

    for match in re.finditer(r'id\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        raw_id = match.group(1).strip()
        if raw_id and re.search(
            r"(title|headline|question|header|heading|eyebrow|caption|prompt|label)",
            raw_id,
            re.IGNORECASE,
        ):
            remember(f"#{raw_id}")

    for match in re.finditer(r'class\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        for raw_class in match.group(1).split():
            if raw_class and re.search(
                r"(title|headline|question|header|heading|eyebrow|caption|prompt|label)",
                raw_class,
                re.IGNORECASE,
            ):
                remember(f".{raw_class}")

    return candidates[:14]

def score_title_selector_candidate(
    requested_selector: str, candidate: str
) -> tuple[int, int, int]:
    requested_tokens = set(re.findall(r"[a-z]+", (requested_selector or "").lower()))
    candidate_tokens = set(re.findall(r"[a-z]+", (candidate or "").lower()))
    overlap = len(requested_tokens & candidate_tokens)
    specificity = (
        2
        if candidate.startswith("#")
        else 1
        if candidate.startswith(".") or candidate.startswith("[")
        else 0
    )
    priority_tokens = (
        "poll-title",
        "title",
        "headline",
        "question",
        "poll-header",
        "header",
        "heading",
        "eyebrow",
        "prompt",
        "label",
        "h1",
        "h2",
        "h3",
    )
    priority = 0
    lowered_candidate = candidate.lower()
    for index, token in enumerate(priority_tokens):
        if token in lowered_candidate:
            priority = len(priority_tokens) - index
            break
    complexity_penalty = -1 if (" " in candidate or ">" in candidate) else 0
    return (overlap, priority, specificity + complexity_penalty)

def choose_title_selector_candidate(
    requested_selector: str, candidates: list[str]
) -> str:
    if not candidates:
        return ""
    normalized_candidates = [item for item in candidates if is_title_like_selector(item)]
    if not normalized_candidates:
        return ""
    normalized_requested = (requested_selector or "").strip()
    if normalized_requested in normalized_candidates:
        return normalized_requested
    ranked = sorted(
        normalized_candidates,
        key=lambda candidate: score_title_selector_candidate(
            normalized_requested, candidate
        ),
        reverse=True,
    )
    return ranked[0] if ranked else ""

def extract_artifact_scene_root_selector_candidates(html: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def remember(selector: str) -> None:
        normalized = selector.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    if re.search(r"data-prezo-scene-root\b", html, re.IGNORECASE):
        remember("[data-prezo-scene-root]")
    for selector in (
        "#scene",
        "#stage",
        "#viewport",
        "#artifact-root",
        "#root",
        "#app",
        "#canvas",
        "#frame",
        "#shell",
        "#container",
        "main",
        "body",
        "html",
    ):
        if re.search(rf"(?<![A-Za-z0-9_-]){re.escape(selector)}(?![A-Za-z0-9_-])", html):
            remember(selector)

    for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = style_match.group("body") or ""
        for raw_selector in re.findall(r"(^|})\s*([^{}]+)\{", style_body, re.MULTILINE):
            selector_text = raw_selector[1].strip()
            if not selector_text or selector_text.startswith("@"):
                continue
            for selector in selector_text.split(","):
                normalized = selector.strip()
                lowered = normalized.lower()
                if (
                    normalized in {"body", "html", "main"}
                    or "data-prezo-scene-root" in lowered
                    or re.search(
                        r"(?:#|\.)(?:[A-Za-z0-9_-]*?(?:scene|stage|viewport|frame|app|root|canvas|shell|container|wrapper|surface|board|arena)[A-Za-z0-9_-]*)",
                        lowered,
                    )
                ):
                    remember(normalized)

    for match in re.finditer(r'id\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        raw_id = match.group(1).strip()
        if raw_id and re.search(
            r"(scene|stage|viewport|frame|app|root|canvas|shell|container|wrapper|surface|board|arena)",
            raw_id,
            re.IGNORECASE,
        ):
            remember(f"#{raw_id}")

    for match in re.finditer(r'class\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        for raw_class in match.group(1).split():
            if raw_class and re.search(
                r"(scene|stage|viewport|frame|app|root|canvas|shell|container|wrapper|surface|board|arena)",
                raw_class,
                re.IGNORECASE,
            ):
                remember(f".{raw_class}")

    body_match = re.search(r"<body\b[^>]*>(?P<body>[\s\S]*?)</body>", html, re.IGNORECASE)
    if body_match:
        body_inner = body_match.group("body") or ""
        first_child_match = re.search(r"<([a-z0-9:_-]+)\b(?P<attrs>[^>]*)>", body_inner, re.IGNORECASE)
        if first_child_match:
            attrs = first_child_match.group("attrs") or ""
            id_match = re.search(r'id\s*=\s*["\']([^"\']+)["\']', attrs, re.IGNORECASE)
            if id_match:
                remember(f"#{id_match.group(1).strip()}")
            class_match = re.search(r'class\s*=\s*["\']([^"\']+)["\']', attrs, re.IGNORECASE)
            if class_match:
                first_class = next(
                    (item.strip() for item in class_match.group(1).split() if item.strip()),
                    "",
                )
                if first_class:
                    remember(f".{first_class}")
            tag_name = (first_child_match.group(1) or "").strip().lower()
            if tag_name in {"main", "section", "article", "div"}:
                remember(tag_name)

    return candidates[:14]

def score_scene_root_selector_candidate(candidate: str) -> tuple[int, int]:
    lowered = (candidate or "").strip().lower()
    if not lowered:
        return (0, 0)
    specificity = (
        3
        if lowered.startswith("[data-prezo-scene-root]")
        else 2
        if lowered.startswith("#")
        else 1
        if lowered.startswith(".")
        else 0
    )
    priority_tokens = (
        "data-prezo-scene-root",
        "artifact-root",
        "scene",
        "stage",
        "viewport",
        "root",
        "app",
        "canvas",
        "frame",
        "shell",
        "container",
        "wrapper",
        "surface",
        "board",
        "arena",
        "main",
        "body",
        "html",
    )
    priority = 0
    for index, token in enumerate(priority_tokens):
        if token in lowered:
            priority = len(priority_tokens) - index
            break
    return (priority, specificity)

def choose_scene_root_selector_candidate(candidates: list[str]) -> str:
    if not candidates:
        return ""
    ranked = sorted(
        candidates,
        key=score_scene_root_selector_candidate,
        reverse=True,
    )
    return ranked[0] if ranked else ""

def choose_artifact_background_treatment_target_selector(
    current_html: str, requested_selector: str
) -> str:
    background_candidates = [
        candidate
        for candidate in extract_artifact_background_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    if background_candidates:
        chosen_background = choose_background_selector_candidate(
            requested_selector,
            background_candidates,
        )
        if chosen_background:
            return chosen_background

    scene_root_candidates = [
        candidate
        for candidate in extract_artifact_scene_root_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    if scene_root_candidates:
        chosen_scene_root = choose_scene_root_selector_candidate(scene_root_candidates)
        if chosen_scene_root:
            return chosen_scene_root

    return choose_background_selector_candidate(
        requested_selector,
        extract_artifact_background_selector_candidates(current_html),
    )

def ensure_generated_background_layer_in_artifact_html(html: str) -> tuple[str, str]:
    selector = "[data-prezo-generated-background-layer]"
    if re.search(r"data-prezo-generated-background-layer\b", html, re.IGNORECASE):
        return html, selector
    layer_markup = (
        '\n<div data-prezo-background-layer="true" '
        'data-prezo-generated-background-layer="true" '
        'aria-hidden="true"></div>'
    )
    body_open = re.search(r"<body\b[^>]*>", html, re.IGNORECASE)
    if body_open:
        insert_at = body_open.end()
        return f"{html[:insert_at]}{layer_markup}{html[insert_at:]}", selector
    html_open = re.search(r"<html\b[^>]*>", html, re.IGNORECASE)
    if html_open:
        insert_at = html_open.end()
        return f"{html[:insert_at]}<body>{layer_markup}</body>{html[insert_at:]}", selector
    return f"<body>{layer_markup}{html}</body>", selector

def score_background_selector_candidate(requested_selector: str, candidate: str) -> tuple[int, int, int]:
    requested_tokens = set(re.findall(r"[a-z]+", (requested_selector or "").lower()))
    candidate_tokens = set(re.findall(r"[a-z]+", (candidate or "").lower()))
    overlap = len(requested_tokens & candidate_tokens)
    specificity = 2 if candidate.startswith("#") else 1 if candidate.startswith(".") else 0
    priority_tokens = ("background", "backdrop", "sky", "city", "scene", "track", "bg")
    priority = 0
    lowered_candidate = candidate.lower()
    for index, token in enumerate(priority_tokens):
        if token in lowered_candidate:
            priority = len(priority_tokens) - index
            break
    return (overlap, priority, specificity)

def choose_background_selector_candidate(
    requested_selector: str, candidates: list[str]
) -> str:
    normalized = (requested_selector or "").strip()
    if not normalized or not candidates:
        return ""
    if normalized in candidates:
        return normalized
    ranked = sorted(
        candidates,
        key=lambda candidate: score_background_selector_candidate(normalized, candidate),
        reverse=True,
    )
    return ranked[0] if ranked else ""

def is_primary_title_selector(selector: str) -> bool:
    lowered = (selector or "").strip().lower()
    if not lowered:
        return False
    if not is_title_like_selector(lowered):
        return False
    if re.search(
        r"(?:option|choice|answer|row|item|vote|count|score|percent|bar|track|result|stat|metric|value)",
        lowered,
    ):
        return False
    if "label" in lowered and not re.search(
        r"(?:title|headline|question|header|heading|eyebrow|caption|prompt)",
        lowered,
    ):
        return False
    return True

def extract_artifact_background_selector_candidates(html: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def remember(selector: str) -> None:
        normalized = selector.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    if re.search(r"data-prezo-background-layer\b", html, re.IGNORECASE):
        remember("[data-prezo-background-layer]")
    for selector in ("body", "html", "#scene", "#track-bg", "#background", "#backdrop"):
        if re.search(rf"(?<![A-Za-z0-9_-]){re.escape(selector)}(?![A-Za-z0-9_-])", html):
            remember(selector)

    for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = style_match.group("body") or ""
        for raw_selector in re.findall(r"(^|})\s*([^{}]+)\{", style_body, re.MULTILINE):
            selector_text = raw_selector[1].strip()
            if not selector_text or selector_text.startswith("@"):
                continue
            for selector in selector_text.split(","):
                normalized = selector.strip()
                lowered = normalized.lower()
                if (
                    normalized in {"body", "html"}
                    or "data-prezo-background-layer" in lowered
                    or re.search(r"(?:#|\.)(?:[A-Za-z0-9_-]*?(?:bg|background|backdrop|sky|city|scene|track)[A-Za-z0-9_-]*)", lowered)
                    or any(token in lowered for token in (" body", " html", "#scene", "#track-bg", "#background", "#backdrop"))
                ):
                    remember(normalized)

    for match in re.finditer(r'id\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        raw_id = match.group(1).strip()
        if raw_id and re.search(r"(bg|background|backdrop|sky|city|scene|track)", raw_id, re.IGNORECASE):
            remember(f"#{raw_id}")

    for match in re.finditer(r'class\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        for raw_class in match.group(1).split():
            if raw_class and re.search(r"(bg|background|backdrop|sky|city|scene|track)", raw_class, re.IGNORECASE):
                remember(f".{raw_class}")

    return candidates[:12]

def extract_artifact_background_style_snippets(html: str) -> list[str]:
    snippets: list[str] = []
    seen: set[str] = set()
    candidates = extract_artifact_background_selector_candidates(html)
    style_bodies = [match.group("body") or "" for match in ARTIFACT_STYLE_TAG_RE.finditer(html)]
    for style_body in style_bodies:
        for raw_selector in re.findall(r"(^|})\s*([^{}]+)\{", style_body, re.MULTILINE):
            selector_text = raw_selector[1].strip()
            if not selector_text or selector_text.startswith("@"):
                continue
            for selector in selector_text.split(","):
                normalized = selector.strip()
                if normalized not in candidates:
                    continue
                selector_re = re.compile(rf"{re.escape(normalized)}\s*\{{", re.IGNORECASE)
                match = selector_re.search(style_body)
                if not match:
                    continue
                brace_start = match.end() - 1
                brace_end = find_matching_delimiter(style_body, brace_start, "{", "}")
                if brace_end < 0:
                    continue
                snippet = style_body[match.start(): brace_end + 1].strip()
                if snippet and snippet not in seen:
                    seen.add(snippet)
                    snippets.append(snippet)
                    if len(snippets) >= 4:
                        return snippets
    return snippets
