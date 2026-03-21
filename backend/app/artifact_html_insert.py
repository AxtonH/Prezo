"""Insert HTML snippets into an artifact's index.html.

Provides a safe, targeted insertion mechanism for the ``insert_html``
patch edit type.  The caller specifies a *target* CSS selector and a
*position* (``beforeend``, ``afterbegin``, ``beforebegin``, ``afterend``)
mirroring the browser's ``insertAdjacentHTML`` API.

Safety:
- ``<script>`` tags and event-handler attributes (``on*``) are stripped
  to prevent XSS in the sandboxed iframe.
- Only the *first* element matching *target* is modified.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

VALID_POSITIONS = {"beforeend", "afterbegin", "beforebegin", "afterend"}


def insert_html_in_artifact(
    html: str,
    *,
    target: str,
    position: str,
    snippet: str,
) -> tuple[str, bool, str]:
    """Insert *snippet* relative to the first element matching *target*.

    Returns ``(updated_html, changed, status)`` where *status* is one of
    ``"changed"``, ``"not_found"``, or ``"invalid"``.
    """
    normalized_position = position.strip().lower()
    if normalized_position not in VALID_POSITIONS:
        return html, False, "invalid"

    safe_snippet = _sanitize_html_snippet(snippet)
    if not safe_snippet.strip():
        return html, False, "invalid"

    target_selector = target.strip()
    if not target_selector:
        return html, False, "invalid"

    # Parse the target selector into tag, id, and classes for matching.
    match_spec = _parse_simple_selector(target_selector)
    if match_spec is None:
        return html, False, "not_found"

    insertion_point = _find_target_element(html, match_spec)
    if insertion_point is None:
        return html, False, "not_found"

    tag_name, open_start, open_end, close_start, close_end = insertion_point

    if normalized_position == "beforeend":
        # Insert just before the closing tag.
        if close_start is None:
            return html, False, "not_found"
        updated = html[:close_start] + safe_snippet + html[close_start:]
    elif normalized_position == "afterbegin":
        # Insert just after the opening tag.
        updated = html[:open_end] + safe_snippet + html[open_end:]
    elif normalized_position == "beforebegin":
        # Insert just before the opening tag.
        updated = html[:open_start] + safe_snippet + html[open_start:]
    elif normalized_position == "afterend":
        # Insert just after the closing tag (or self-closing open tag).
        end = close_end if close_end is not None else open_end
        updated = html[:end] + safe_snippet + html[end:]
    else:
        return html, False, "invalid"

    return updated, True, "changed"


# ---------------------------------------------------------------------------
# Sanitisation
# ---------------------------------------------------------------------------

_SCRIPT_TAG_RE = re.compile(
    r"<script\b[^>]*>[\s\S]*?</script\s*>",
    re.IGNORECASE,
)
_EVENT_ATTR_RE = re.compile(
    r"""\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)""",
    re.IGNORECASE,
)
_JAVASCRIPT_HREF_RE = re.compile(
    r"""(href\s*=\s*)(["'])javascript:.*?\2""",
    re.IGNORECASE,
)


def _sanitize_html_snippet(snippet: str) -> str:
    """Remove ``<script>`` tags and ``on*`` event attributes."""
    result = _SCRIPT_TAG_RE.sub("", snippet)
    result = _EVENT_ATTR_RE.sub("", result)
    result = _JAVASCRIPT_HREF_RE.sub(r'\1\2#\2', result)
    return result


# ---------------------------------------------------------------------------
# Simple CSS selector parsing (tag, #id, .class only)
# ---------------------------------------------------------------------------

_SELECTOR_TOKEN_RE = re.compile(r"([#.]?[\w-]+)")


def _parse_simple_selector(
    selector: str,
) -> dict[str, Any] | None:
    """Parse a simple CSS selector into a match spec.

    Supports: ``tag``, ``#id``, ``.class``, ``tag.class``, ``tag#id``,
    ``.class1.class2``, and attribute selectors like ``[data-foo]``.
    Combinators (space, ``>``, ``+``, ``~``) are NOT supported — returns
    ``None`` for those.
    """
    raw = selector.strip()
    if not raw:
        return None

    # Attribute selector — extract the attribute name.
    attr_match = re.match(r"^\[([a-zA-Z_][\w-]*)\]$", raw)
    if attr_match:
        return {"tag": None, "id": None, "classes": [], "attr": attr_match.group(1)}

    # Tag + attribute, e.g. ``div[data-foo]``
    tag_attr_match = re.match(r"^(\w[\w-]*)\[([a-zA-Z_][\w-]*)\]$", raw)
    if tag_attr_match:
        return {
            "tag": tag_attr_match.group(1).lower(),
            "id": None,
            "classes": [],
            "attr": tag_attr_match.group(2),
        }

    # Reject combinators (presence of whitespace between tokens).
    if re.search(r"[\s>+~]", raw):
        # Allow spaces only inside attribute selectors (already handled above).
        return None

    tag: str | None = None
    elem_id: str | None = None
    classes: list[str] = []

    for token_match in _SELECTOR_TOKEN_RE.finditer(raw):
        token = token_match.group(1)
        if token.startswith("#"):
            elem_id = token[1:]
        elif token.startswith("."):
            classes.append(token[1:])
        else:
            tag = token.lower()

    if tag is None and elem_id is None and not classes:
        return None

    return {"tag": tag, "id": elem_id, "classes": classes, "attr": None}


# ---------------------------------------------------------------------------
# HTML element finder
# ---------------------------------------------------------------------------


class _ElementFinder(HTMLParser):
    """Find the first element matching a simple selector spec."""

    def __init__(self, match_spec: dict[str, Any]) -> None:
        super().__init__(convert_charrefs=False)
        self._spec = match_spec
        self._found = False
        self._tag_name: str | None = None
        self._open_start: int | None = None
        self._open_end: int | None = None
        self._close_start: int | None = None
        self._close_end: int | None = None
        self._depth = 0
        self._void_tags = {
            "area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr",
        }

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._found:
            if tag.lower() == self._tag_name:
                self._depth += 1
            return

        if not self._matches(tag, attrs):
            return

        self._found = True
        self._tag_name = tag.lower()
        line, col = self.getpos()
        self._open_start = self._pos_to_offset(line, col)
        # Find the end of the opening tag.
        gt_pos = self.rawdata.find(">", self._open_start)
        if gt_pos >= 0:
            self._open_end = gt_pos + 1
        else:
            self._open_end = self._open_start

        if self._tag_name in self._void_tags:
            self._close_start = None
            self._close_end = None

    def handle_endtag(self, tag: str) -> None:
        if not self._found or tag.lower() != self._tag_name:
            return
        if self._depth > 0:
            self._depth -= 1
            return
        line, col = self.getpos()
        offset = self._pos_to_offset(line, col)
        self._close_start = offset
        close_tag = f"</{tag}>"
        end_pos = self.rawdata.find(close_tag, offset)
        if end_pos >= 0:
            self._close_end = end_pos + len(close_tag)
        else:
            self._close_end = offset

    def _matches(self, tag: str, attrs: list[tuple[str, str | None]]) -> bool:
        spec = self._spec
        if spec.get("tag") and tag.lower() != spec["tag"]:
            return False
        attr_dict = {k.lower(): (v or "") for k, v in attrs}
        if spec.get("id"):
            if attr_dict.get("id", "") != spec["id"]:
                return False
        if spec.get("classes"):
            elem_classes = set(attr_dict.get("class", "").split())
            if not all(cls in elem_classes for cls in spec["classes"]):
                return False
        if spec.get("attr"):
            if spec["attr"].lower() not in attr_dict:
                return False
        return True

    def _pos_to_offset(self, line: int, col: int) -> int:
        """Convert (line, col) from ``getpos()`` to a string offset."""
        offset = 0
        for i, raw_line in enumerate(self.rawdata.splitlines(True), 1):
            if i == line:
                return offset + col
            offset += len(raw_line)
        return offset + col

    @property
    def result(
        self,
    ) -> tuple[str, int, int, int | None, int | None] | None:
        if not self._found or self._open_start is None or self._open_end is None:
            return None
        return (
            self._tag_name or "",
            self._open_start,
            self._open_end,
            self._close_start,
            self._close_end,
        )


def _find_target_element(
    html: str,
    match_spec: dict[str, Any],
) -> tuple[str, int, int, int | None, int | None] | None:
    """Return ``(tag, open_start, open_end, close_start, close_end)`` or None."""
    finder = _ElementFinder(match_spec)
    finder.rawdata = html
    finder.feed(html)
    return finder.result
