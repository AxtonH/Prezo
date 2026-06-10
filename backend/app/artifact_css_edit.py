"""String-level CSS editing and inspection primitives for artifact HTML.

These operate directly on raw CSS text or on <style> tags inside a full
artifact HTML document, using a quote/comment-aware delimiter scanner
rather than a CSS parser. Extracted from app.api.ai.
"""

from __future__ import annotations

import re


ARTIFACT_STYLE_TAG_RE = re.compile(
    r"<style\b[^>]*>(?P<body>[\s\S]*?)</style>", re.IGNORECASE
)

def extract_combined_artifact_css_text(html: str) -> str:
    segments = [
        (style_match.group("body") or "")
        for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html or "")
    ]
    return "\n\n".join(segment for segment in segments if segment.strip())

def extract_css_rule_bodies_for_selector(css_text: str, selector: str) -> list[str]:
    normalized_selector = (selector or "").strip()
    if not normalized_selector:
        return []
    selector_pattern = re.escape(normalized_selector)
    pattern = re.compile(
        rf"{selector_pattern}\s*\{{(?P<body>[\s\S]*?)\}}",
        re.IGNORECASE,
    )
    return [
        (match.group("body") or "").strip()
        for match in pattern.finditer(css_text or "")
    ]

def has_css_property_for_selector(
    css_text: str, selector: str, property_name: str
) -> bool:
    normalized_property = (property_name or "").strip()
    if not normalized_property:
        return False
    property_pattern = re.compile(
        rf"\b{re.escape(normalized_property)}\s*:",
        re.IGNORECASE,
    )
    return any(
        property_pattern.search(body)
        for body in extract_css_rule_bodies_for_selector(css_text, selector)
    )

def has_css_property_value_for_selector(
    css_text: str, selector: str, property_name: str, value_fragment: str
) -> bool:
    normalized_property = (property_name or "").strip()
    normalized_value = (value_fragment or "").strip()
    if not normalized_property or not normalized_value:
        return False
    pattern = re.compile(
        rf"\b{re.escape(normalized_property)}\s*:\s*[^;]*{re.escape(normalized_value)}[^;]*;",
        re.IGNORECASE,
    )
    return any(
        pattern.search(body)
        for body in extract_css_rule_bodies_for_selector(css_text, selector)
    )

def find_matching_delimiter(
    text: str, opening_index: int, opening_char: str, closing_char: str
) -> int:
    if opening_index < 0 or opening_index >= len(text):
        return -1
    depth = 0
    mode = "code"
    index = opening_index
    while index < len(text):
        char = text[index]
        next_char = text[index + 1] if index + 1 < len(text) else ""
        if mode == "block_comment":
            if char == "*" and next_char == "/":
                mode = "code"
                index += 2
                continue
            index += 1
            continue
        if mode == "single_quote":
            if char == "\\":
                index += 2
                continue
            if char == "'":
                mode = "code"
            index += 1
            continue
        if mode == "double_quote":
            if char == "\\":
                index += 2
                continue
            if char == '"':
                mode = "code"
            index += 1
            continue

        if char == "/" and next_char == "*":
            mode = "block_comment"
            index += 2
            continue
        if char == "'":
            mode = "single_quote"
            index += 1
            continue
        if char == '"':
            mode = "double_quote"
            index += 1
            continue
        if char == opening_char:
            depth += 1
        elif char == closing_char:
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return -1

def set_css_property_in_artifact_html(
    html: str, selector: str, property_name: str, value: str
) -> tuple[str, bool]:
    remembered_no_change = False
    for match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = match.group("body")
        updated_body, changed, match_status = set_css_property_in_css(
            style_body, selector, property_name, value
        )
        if match_status == "not_found":
            continue
        if match_status == "no_change":
            remembered_no_change = True
            continue
        body_start, body_end = match.span("body")
        return f"{html[:body_start]}{updated_body}{html[body_end:]}", True
    if remembered_no_change:
        return html, False
    return html, False

def ensure_css_property_in_artifact_html(
    html: str, selector: str, property_name: str, value: str
) -> str:
    updated_html, changed = set_css_property_in_artifact_html(
        html,
        selector,
        property_name,
        value,
    )
    if changed:
        return updated_html
    rule_body = f"{property_name}: {value};"
    return upsert_css_rule_in_artifact_html(updated_html, selector, rule_body)

def upsert_css_rule_in_artifact_html(html: str, selector: str, rule_body: str) -> str:
    for match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = match.group("body") or ""
        updated_body, changed = upsert_css_rule_in_css(style_body, selector, rule_body)
        if not changed:
            continue
        body_start, body_end = match.span("body")
        return f"{html[:body_start]}{updated_body}{html[body_end:]}"

    rule = build_css_rule(selector, rule_body)
    head_close = re.search(r"</head\s*>", html, re.IGNORECASE)
    if head_close:
        return f"{html[:head_close.start()]}<style>\n{rule}\n</style>\n{html[head_close.start():]}"
    body_open = re.search(r"<body\b[^>]*>", html, re.IGNORECASE)
    if body_open:
        insert_at = body_open.end()
        return f"{html[:insert_at]}\n<style>\n{rule}\n</style>{html[insert_at:]}"
    return f"<style>\n{rule}\n</style>\n{html}"

def upsert_css_rule_in_css(css_text: str, selector: str, rule_body: str) -> tuple[str, bool]:
    selector_re = re.compile(rf"(^|}})\s*{re.escape(selector)}\s*\{{", re.IGNORECASE | re.MULTILINE)
    match = selector_re.search(css_text)
    if match:
        brace_start = css_text.find("{", match.start())
        if brace_start >= 0:
            brace_end = find_matching_delimiter(css_text, brace_start, "{", "}")
            if brace_end >= 0:
                return (
                    f"{css_text[:match.start()]}{build_css_rule(selector, rule_body)}{css_text[brace_end + 1:]}",
                    True,
                )

    suffix = "" if not css_text.strip() or css_text.endswith("\n") else "\n"
    return f"{css_text}{suffix}{build_css_rule(selector, rule_body)}\n", True

def build_css_rule(selector: str, rule_body: str) -> str:
    lines = [line.rstrip() for line in (rule_body or "").splitlines() if line.strip()]
    if not lines:
        return f"{selector} {{\n}}\n"
    formatted = "\n".join(f"  {line.strip()}" for line in lines)
    return f"{selector} {{\n{formatted}\n}}"

def set_css_property_in_css(
    css_text: str, selector: str, property_name: str, value: str
) -> tuple[str, bool, str]:
    selector_re = re.compile(rf"{re.escape(selector)}\s*\{{", re.IGNORECASE)
    saw_no_change = False
    for match in selector_re.finditer(css_text):
        brace_start = match.end() - 1
        brace_end = find_matching_delimiter(css_text, brace_start, "{", "}")
        if brace_end < 0:
            continue

        body_start = brace_start + 1
        body_end = brace_end
        body = css_text[body_start:body_end]
        property_re = re.compile(
            rf"(?P<prefix>\b{re.escape(property_name)}\s*:\s*)(?P<value>[^;}}]+)",
            re.IGNORECASE,
        )
        property_match = property_re.search(body)
        if property_match:
            if property_match.group("value").strip() == value.strip():
                saw_no_change = True
                continue
            updated_body = property_re.sub(
                lambda property_match: f"{property_match.group('prefix')}{value}",
                body,
                count=1,
            )
        else:
            trimmed = body.rstrip()
            if trimmed and not trimmed.endswith(";"):
                trimmed = f"{trimmed};"
            indent_match = re.search(r"\n([ \t]+)\S", body)
            indent = indent_match.group(1) if indent_match else "  "
            if trimmed:
                updated_body = f"{trimmed}\n{indent}{property_name}: {value};\n"
            else:
                updated_body = f"\n{indent}{property_name}: {value};\n"

        return (
            f"{css_text[:body_start]}{updated_body}{css_text[body_end:]}",
            True,
            "changed",
        )

    if saw_no_change:
        return css_text, False, "no_change"
    return css_text, False, "not_found"
