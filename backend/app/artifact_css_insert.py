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

    # Sanitise: strip any nested braces / @-rules to prevent injection.
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
