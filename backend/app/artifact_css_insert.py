"""Insert new CSS rules into an artifact's styles.css.

Provides the ``insert_css_rule`` patch edit type.  The caller supplies a
*selector* and a *css* block (the declarations without the outer braces).
The rule is appended to the stylesheet.  If a rule with the same selector
already exists, the new declarations are **merged** into it (existing
properties are preserved, new ones are added).
"""

from __future__ import annotations

import re

from .artifact_css_tree import (
    _append_css_rule as append_css_rule,
    _iter_css_rule_blocks,
    _parse_css_declarations,
    _render_css_declarations,
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def insert_css_rule_in_stylesheet(
    css_text: str,
    *,
    selector: str,
    css: str,
) -> tuple[str, bool, str]:
    """Insert or merge a CSS rule for *selector* with declarations *css*.

    Returns ``(updated_css, changed, status)`` where *status* is one of
    ``"changed"`` or ``"invalid"``.
    """
    normalized_selector = selector.strip()
    normalized_css = css.strip()

    if not normalized_selector or not normalized_css:
        return css_text, False, "invalid"

    # --- @-rule path (e.g. @keyframes, @media) ---
    # These legitimately contain braces in their body, so they bypass the
    # normal declaration-parsing logic and are appended as raw blocks.
    if normalized_selector.startswith("@"):
        return _insert_at_rule(css_text, normalized_selector, normalized_css)

    # Sanitise: reject braces in regular rule bodies to prevent injection.
    if re.search(r"[{}]", normalized_css):
        return css_text, False, "invalid"

    new_declarations = _parse_css_declarations(normalized_css)
    if not new_declarations:
        return css_text, False, "invalid"

    # Check if a rule with this selector already exists.
    target_lower = normalized_selector.lower()
    for block in _iter_css_rule_blocks(css_text):
        if block.selector.lower() != target_lower:
            continue

        # Merge new declarations into the existing rule.
        body = css_text[block.body_start : block.body_end]
        existing = _parse_css_declarations(body)
        existing_names = {name.strip().lower() for name, _ in existing}

        merged = list(existing)
        added_any = False
        for name, value in new_declarations:
            if name.strip().lower() in existing_names:
                continue
            merged.append((name, value))
            added_any = True

        if not added_any:
            return css_text, False, "no_change"

        updated_body = _render_css_declarations(body, merged)
        updated = (
            f"{css_text[:block.body_start]}{updated_body}{css_text[block.body_end:]}"
        )
        return updated, True, "changed"

    # No existing rule — append a new one.
    # Build property lines from all declarations.
    lines = [f"{name.strip()}: {value.strip()}" for name, value in new_declarations]
    first_prop = lines[0].split(":")[0].strip()
    first_val = lines[0].split(":", 1)[1].strip() if ":" in lines[0] else ""

    # Use append_css_rule for the first property, then add the rest.
    if len(new_declarations) == 1:
        updated = append_css_rule(
            css_text,
            selector=normalized_selector,
            property_name=first_prop,
            value=first_val,
        )
    else:
        # Build a multi-property rule manually.
        normalized = css_text.rstrip()
        separator = "\n\n" if normalized else ""
        decl_lines = "\n".join(
            f"  {name.strip()}: {value.strip()};" for name, value in new_declarations
        )
        rule = f"{normalized_selector} {{\n{decl_lines}\n}}"
        updated = f"{normalized}{separator}{rule}\n"

    return updated, True, "changed"


# ---------------------------------------------------------------------------
# @-rule support (keyframes, media, etc.)
# ---------------------------------------------------------------------------

# Matches a <script> tag or javascript: URI that could be injected via
# CSS content / url() values.
_CSS_SCRIPT_RE = re.compile(r"<script|javascript\s*:", re.IGNORECASE)


_AT_RULE_BLOCK_RE = re.compile(
    r"(?P<prelude>@[\w-]+\s+[\w-]+)\s*\{",
    re.IGNORECASE,
)


def _find_at_rule_block(css_text: str, selector: str) -> tuple[int, int] | None:
    """Find the start and end (after closing ``}``) of an existing @-rule
    whose prelude matches *selector* (e.g. ``@keyframes shoot``).

    Returns ``(start, end)`` or ``None`` if not found.
    """
    target = selector.strip().lower()
    for m in _AT_RULE_BLOCK_RE.finditer(css_text):
        if m.group("prelude").strip().lower() != target:
            continue
        # Walk forward from the opening brace to find its matching close.
        open_pos = m.end() - 1  # position of '{'
        depth = 0
        idx = open_pos
        while idx < len(css_text):
            ch = css_text[idx]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return m.start(), idx + 1
            idx += 1
    return None


def _insert_at_rule(
    css_text: str,
    selector: str,
    css_body: str,
) -> tuple[str, bool, str]:
    """Insert or replace an @-rule block (e.g. ``@keyframes floatCloud``).

    If a rule with the same prelude already exists, it is **replaced** in-place
    to prevent duplicate @keyframes from accumulating.

    The *css_body* is the inner content of the block (including nested ``{}``
    for keyframe stops / media queries).  Basic sanitisation rejects
    ``<script`` and ``javascript:`` patterns but allows braces.
    """
    if _CSS_SCRIPT_RE.search(css_body):
        return css_text, False, "invalid"

    new_rule = f"{selector} {{\n  {css_body}\n}}"

    # Replace existing @-rule with the same name if found.
    existing = _find_at_rule_block(css_text, selector)
    if existing is not None:
        start, end = existing
        # Preserve surrounding whitespace.
        updated = css_text[:start] + new_rule + css_text[end:]
        return updated, True, "changed"

    # No existing rule — append.
    normalized = css_text.rstrip()
    separator = "\n\n" if normalized else ""
    return f"{normalized}{separator}{new_rule}\n", True, "changed"
