from __future__ import annotations

from dataclasses import dataclass
import re


@dataclass(slots=True, frozen=True)
class CssRuleBlock:
    selector: str
    body_start: int
    body_end: int


def set_css_property_in_css_tree(
    css_text: str,
    selector: str,
    property_name: str,
    value: str,
) -> tuple[str, bool, str]:
    normalized_selector = selector.strip()
    normalized_property_name = property_name.strip()
    normalized_value = value.strip()
    if not normalized_selector or not normalized_property_name:
        return css_text, False, "not_found"

    target_selector = normalized_selector.lower()
    target_property = _normalize_property_name(normalized_property_name)
    saw_no_change = False

    for block in _iter_css_rule_blocks(css_text):
        if block.selector.lower() != target_selector:
            continue

        body = css_text[block.body_start : block.body_end]
        declarations = _parse_css_declarations(body)
        replaced = False
        changed = False
        next_declarations: list[tuple[str, str]] = []

        for decl_name, decl_value in declarations:
            if _normalize_property_name(decl_name) != target_property:
                next_declarations.append((decl_name, decl_value))
                continue
            replaced = True
            if decl_value.strip() == normalized_value:
                next_declarations.append((decl_name, decl_value))
                saw_no_change = True
                continue
            next_declarations.append((normalized_property_name, normalized_value))
            changed = True

        if not replaced:
            next_declarations.append((normalized_property_name, normalized_value))
            changed = True

        if not changed:
            continue

        updated_body = _render_css_declarations(body, next_declarations)
        return (
            f"{css_text[:block.body_start]}{updated_body}{css_text[block.body_end:]}",
            True,
            "changed",
        )

    if _is_insertable_pseudo_selector(normalized_selector):
        base_selector = _strip_terminal_pseudo_selector(normalized_selector)
        if base_selector and _css_selector_exists(css_text, base_selector):
            appended_css = _append_css_rule(
                css_text,
                selector=normalized_selector,
                property_name=normalized_property_name,
                value=normalized_value,
            )
            return appended_css, True, "changed"

    if saw_no_change:
        return css_text, False, "no_change"
    return css_text, False, "not_found"


def _iter_css_rule_blocks(
    css_text: str,
    *,
    start: int = 0,
    end: int | None = None,
) -> list[CssRuleBlock]:
    final_end = len(css_text) if end is None else max(0, min(end, len(css_text)))
    blocks: list[CssRuleBlock] = []
    index = max(0, start)
    token_start = index

    while index < final_end:
        char = css_text[index]
        next_char = css_text[index + 1] if index + 1 < final_end else ""

        if char == "/" and next_char == "*":
            index = _advance_past_comment(css_text, index, final_end)
            continue
        if char in {"'", '"'}:
            index = _advance_past_string(css_text, index, final_end)
            continue

        if char == ";":
            index += 1
            token_start = index
            continue

        if char != "{":
            index += 1
            continue

        prelude = css_text[token_start:index].strip()
        block_end = _find_matching_delimiter(css_text, index, "{", "}", final_end)
        if block_end < 0:
            break
        body_start = index + 1
        body_end = block_end

        if prelude.startswith("@"):
            blocks.extend(
                _iter_css_rule_blocks(
                    css_text,
                    start=body_start,
                    end=body_end,
                )
            )
        elif prelude:
            selectors = _split_selector_list(prelude)
            for selector in selectors:
                if selector:
                    blocks.append(
                        CssRuleBlock(
                            selector=selector,
                            body_start=body_start,
                            body_end=body_end,
                        )
                    )

        index = block_end + 1
        token_start = index

    return blocks


def _split_selector_list(prelude: str) -> list[str]:
    selectors: list[str] = []
    start = 0
    depth_parenthesis = 0
    depth_brackets = 0
    index = 0
    length = len(prelude)

    while index < length:
        char = prelude[index]
        next_char = prelude[index + 1] if index + 1 < length else ""
        if char == "/" and next_char == "*":
            index = _advance_past_comment(prelude, index, length)
            continue
        if char in {"'", '"'}:
            index = _advance_past_string(prelude, index, length)
            continue
        if char == "(":
            depth_parenthesis += 1
        elif char == ")" and depth_parenthesis > 0:
            depth_parenthesis -= 1
        elif char == "[":
            depth_brackets += 1
        elif char == "]" and depth_brackets > 0:
            depth_brackets -= 1
        elif char == "," and depth_parenthesis == 0 and depth_brackets == 0:
            selectors.append(prelude[start:index].strip())
            start = index + 1
        index += 1

    selectors.append(prelude[start:].strip())
    return [selector for selector in selectors if selector]


def _parse_css_declarations(body: str) -> list[tuple[str, str]]:
    declarations: list[tuple[str, str]] = []
    for statement in _split_css_statements(body):
        chunk = statement.strip()
        if not chunk:
            continue
        colon_index = _find_top_level_colon(chunk)
        if colon_index < 0:
            continue
        name = chunk[:colon_index].strip()
        value = chunk[colon_index + 1 :].strip()
        if not name:
            continue
        declarations.append((name, value))
    return declarations


def _split_css_statements(body: str) -> list[str]:
    statements: list[str] = []
    start = 0
    depth_parenthesis = 0
    depth_brackets = 0
    index = 0
    length = len(body)

    while index < length:
        char = body[index]
        next_char = body[index + 1] if index + 1 < length else ""
        if char == "/" and next_char == "*":
            index = _advance_past_comment(body, index, length)
            continue
        if char in {"'", '"'}:
            index = _advance_past_string(body, index, length)
            continue
        if char == "(":
            depth_parenthesis += 1
        elif char == ")" and depth_parenthesis > 0:
            depth_parenthesis -= 1
        elif char == "[":
            depth_brackets += 1
        elif char == "]" and depth_brackets > 0:
            depth_brackets -= 1
        elif char == ";" and depth_parenthesis == 0 and depth_brackets == 0:
            statements.append(body[start:index])
            start = index + 1
        index += 1

    tail = body[start:]
    if tail.strip():
        statements.append(tail)
    return statements


def _find_top_level_colon(text: str) -> int:
    depth_parenthesis = 0
    depth_brackets = 0
    index = 0
    length = len(text)

    while index < length:
        char = text[index]
        next_char = text[index + 1] if index + 1 < length else ""
        if char == "/" and next_char == "*":
            index = _advance_past_comment(text, index, length)
            continue
        if char in {"'", '"'}:
            index = _advance_past_string(text, index, length)
            continue
        if char == "(":
            depth_parenthesis += 1
        elif char == ")" and depth_parenthesis > 0:
            depth_parenthesis -= 1
        elif char == "[":
            depth_brackets += 1
        elif char == "]" and depth_brackets > 0:
            depth_brackets -= 1
        elif char == ":" and depth_parenthesis == 0 and depth_brackets == 0:
            return index
        index += 1
    return -1


def _render_css_declarations(
    original_body: str,
    declarations: list[tuple[str, str]],
) -> str:
    indent = _detect_css_indent(original_body)
    if not declarations:
        return "\n"
    lines = [f"{indent}{name.strip()}: {value.strip()};" for name, value in declarations]
    return f"\n{'\n'.join(lines)}\n"


def _detect_css_indent(body: str) -> str:
    for line in body.splitlines():
        stripped = line.lstrip()
        if not stripped:
            continue
        return line[: len(line) - len(stripped)]
    return "  "


def _normalize_property_name(name: str) -> str:
    normalized = name.strip()
    if normalized.startswith("--"):
        return normalized
    return normalized.lower()


def _is_insertable_pseudo_selector(selector: str) -> bool:
    return bool(re.search(r":{1,2}(?:before|after)\s*$", selector, re.IGNORECASE))


def _strip_terminal_pseudo_selector(selector: str) -> str:
    return re.sub(
        r"\s*:{1,2}(?:before|after)\s*$",
        "",
        selector.strip(),
        flags=re.IGNORECASE,
    ).strip()


def _css_selector_exists(css_text: str, selector: str) -> bool:
    target = selector.strip().lower()
    if not target:
        return False
    for block in _iter_css_rule_blocks(css_text):
        if block.selector.strip().lower() == target:
            return True
    return False


def _append_css_rule(
    css_text: str,
    *,
    selector: str,
    property_name: str,
    value: str,
) -> str:
    normalized = css_text.rstrip()
    separator = "\n\n" if normalized else ""
    appended_rule = f"{selector} {{\n  {property_name}: {value};\n}}"
    return f"{normalized}{separator}{appended_rule}\n"


def _find_matching_delimiter(
    text: str,
    start_index: int,
    opening_char: str,
    closing_char: str,
    end_index: int,
) -> int:
    depth = 0
    index = start_index
    while index < end_index:
        char = text[index]
        next_char = text[index + 1] if index + 1 < end_index else ""
        if char == "/" and next_char == "*":
            index = _advance_past_comment(text, index, end_index)
            continue
        if char in {"'", '"'}:
            index = _advance_past_string(text, index, end_index)
            continue
        if char == opening_char:
            depth += 1
        elif char == closing_char:
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return -1


def _advance_past_comment(text: str, start_index: int, end_index: int) -> int:
    close_index = text.find("*/", start_index + 2, end_index)
    if close_index < 0:
        return end_index
    return close_index + 2


def _advance_past_string(text: str, start_index: int, end_index: int) -> int:
    quote = text[start_index]
    index = start_index + 1
    while index < end_index:
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if char == quote:
            return index + 1
        index += 1
    return end_index
