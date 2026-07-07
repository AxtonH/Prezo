"""Artifact HTML quality pipeline: normalization, validation, and model context.

Unwraps raw model output into artifact HTML, lints it for fatal issues,
auto-repairs structural script damage, preserves the live poll-state hook
scripts, prepares/compresses the artifact context sent to the model, and
holds the repair-loop policy knobs. Extracted from app.api.ai.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

from fastapi import HTTPException, status

from .ai_prompts import artifact_activity_family, normalize_artifact_activity_kind
from .artifact_edit_intent import resolve_artifact_edit_request_feedback
from .artifact_package import materialize_artifact_html_from_package, sanitize_artifact_package


ARTIFACT_MAX_REPAIR_ATTEMPTS = 3

ARTIFACT_EDIT_MAX_REPAIR_ATTEMPTS = 1

ARTIFACT_BUILD_MAX_REPAIR_ATTEMPTS = 2

ARTIFACT_REPAIR_MODE_MAX_REPAIR_ATTEMPTS = 1

ARTIFACT_EDIT_FOLLOWUP_RESERVE_SECONDS = 60.0

ARTIFACT_BUILD_FOLLOWUP_RESERVE_SECONDS = 45.0

ARTIFACT_REPAIR_FOLLOWUP_RESERVE_SECONDS = 45.0

ARTIFACT_CONTEXT_DIRECT_CHAR_LIMIT = 24000

ARTIFACT_CONTEXT_HEAD_CHAR_LIMIT = 9000

ARTIFACT_CONTEXT_TAIL_CHAR_LIMIT = 4000

ARTIFACT_CONTEXT_COMBINED_CHAR_LIMIT = 32000

ARTIFACT_LIVE_HOOK_CONTEXT_CHAR_LIMIT = 12000

ARTIFACT_RECENT_EDIT_REQUEST_LIMIT = 4

ARTIFACT_RECENT_EDIT_REQUEST_CHAR_LIMIT = 280

# User-attached image URLs (Phase 1 upload endpoint) the model may embed or use as a
# style reference. Capped to keep the prompt small and avoid context truncation.
# Inline attachments (a chip per element of the scene) routinely use several at once,
# so this matches ARTIFACT_REFERENCE_IMAGE_MAX_ITEMS (the vision cap) below.
ARTIFACT_ATTACHED_IMAGE_URL_LIMIT = 6

ARTIFACT_ATTACHED_IMAGE_URL_CHAR_LIMIT = 2048

# After brand injection, designGuidelines should stay a short executive summary + small user slice.
ARTIFACT_DESIGN_GUIDELINES_CHAR_LIMIT = 1400

# Stored plain-text brand brief from BrandProfile.prompt_brand_guidelines (separate from designGuidelines).
ARTIFACT_PROMPT_BRAND_GUIDELINES_CHAR_LIMIT = 8000

ARTIFACT_SCRIPT_RE = re.compile(
    r"<script\b[^>]*>(?P<body>[\s\S]*?)</script>", re.IGNORECASE
)

ARTIFACT_MARKDOWN_FENCE_BLOCK_RE = re.compile(
    r"```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```", re.IGNORECASE
)

ARTIFACT_MARKDOWN_FENCE_FULL_RE = re.compile(
    r"^\s*```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```\s*$", re.IGNORECASE
)

ARTIFACT_MARKDOWN_FENCE_LINE_RE = re.compile(
    r"^\s*```(?:[a-z0-9_-]+)?\s*$", re.IGNORECASE | re.MULTILINE
)

ARTIFACT_SCRIPT_OPEN_RE = re.compile(r"<script\b", re.IGNORECASE)

ARTIFACT_SCRIPT_CLOSE_RE = re.compile(r"</script>", re.IGNORECASE)

ARTIFACT_HTML_SHAPE_RE = re.compile(
    r"<(?:!doctype|html|body|main|section|article|div|style|script)\b",
    re.IGNORECASE,
)

ARTIFACT_POLL_LIVE_STATE_TOKENS = (
    "prezoSetPollRenderer",
    "prezoRenderPoll",
    "prezo:poll-update",
    "prezoGetPollState",
    "__PREZO_POLL_STATE",
)

ARTIFACT_QNA_LIVE_STATE_TOKENS = (
    "prezoSetQnaRenderer",
    "prezoRenderQna",
    "prezo:qna-update",
    "prezoGetQnaState",
    "__PREZO_QNA_STATE",
)

# Union of every kind's tokens. Hook extraction/preservation uses this so a
# live-wiring script survives edits regardless of the artifact's kind;
# validation gates on the kind-specific set via live_state_tokens_for_activity_kind.
ARTIFACT_LIVE_STATE_TOKENS = ARTIFACT_POLL_LIVE_STATE_TOKENS + ARTIFACT_QNA_LIVE_STATE_TOKENS


def live_state_tokens_for_activity_kind(activity_kind: str) -> tuple[str, ...]:
    if artifact_activity_family(activity_kind) == "qna":
        return ARTIFACT_QNA_LIVE_STATE_TOKENS
    return ARTIFACT_POLL_LIVE_STATE_TOKENS


def resolve_artifact_activity_kind(context: Any) -> str:
    """Activity kind for an AI request: context.artifact.activityKind, with a
    top-level context.activityKind fallback. Missing/unknown → poll."""
    if isinstance(context, dict):
        artifact_context = context.get("artifact")
        if isinstance(artifact_context, dict) and artifact_context.get("activityKind"):
            return normalize_artifact_activity_kind(artifact_context.get("activityKind"))
        return normalize_artifact_activity_kind(context.get("activityKind"))
    return "poll"

def compact_brand_facts_for_prompt(facts: Any) -> dict[str, Any]:
    """Keep artifact JSON small; colors list is the main growth vector."""
    if not isinstance(facts, dict):
        return {}
    out = dict(facts)
    colors = out.get("colors")
    if isinstance(colors, list) and len(colors) > 24:
        out["colors"] = colors[:24]
    return out

def extract_artifact_original_edit_request(
    artifact_context: dict[str, Any], fallback_prompt: str = ""
) -> str:
    value = artifact_context.get("originalEditRequest")
    request = value.strip() if isinstance(value, str) and value.strip() else (fallback_prompt or "").strip()
    return resolve_artifact_edit_request_feedback(artifact_context, request)

def extract_artifact_attached_image_urls(artifact_context: dict[str, Any]) -> list[str]:
    """Validated, de-duplicated http(s) image URLs the user attached for this build.

    Defends against malformed client input: only keeps http/https strings within the
    length cap, dedupes while preserving order, and limits the count so the prompt
    stays small and the URLs survive context compression.
    """
    if not isinstance(artifact_context, dict):
        return []
    raw = artifact_context.get("attachedImageUrls")
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    urls: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        url = item.strip()
        if not url or len(url) > ARTIFACT_ATTACHED_IMAGE_URL_CHAR_LIMIT:
            continue
        if not (url.startswith("http://") or url.startswith("https://")):
            continue
        if url in seen:
            continue
        seen.add(url)
        urls.append(url)
        if len(urls) >= ARTIFACT_ATTACHED_IMAGE_URL_LIMIT:
            break
    return urls

def get_artifact_patch_source_html(artifact_context: dict[str, Any]) -> str:
    full_html = artifact_context.get("currentArtifactFullHtml")
    if isinstance(full_html, str) and full_html.strip():
        return full_html.strip()
    package = get_artifact_patch_source_package(artifact_context)
    if package:
        return materialize_artifact_html_from_package(package)
    current_html = artifact_context.get("currentArtifactHtml")
    if isinstance(current_html, str) and current_html.strip():
        return current_html.strip()
    return ""

def get_artifact_patch_source_package(
    artifact_context: dict[str, Any],
) -> dict[str, Any] | None:
    for key in ("currentArtifactPackage", "currentArtifactFullPackage"):
        value = artifact_context.get(key)
        if isinstance(value, dict):
            sanitized = sanitize_artifact_package(value)
            if sanitized:
                return sanitized
    return None

STYLE_OVERRIDES_PROMPT_MAX_TOTAL = 4500

STYLE_OVERRIDES_PROMPT_MAX_KEYS = 40

STYLE_OVERRIDES_PROMPT_SNIPPET_PER_KEY = 320

def format_style_overrides_for_prompt(overrides: Any) -> str:
    """
    Summarize host-side styleOverrides (manual rich-text HTML per field) for LLM context.
    The base artifact files may not reflect these; the user sees the merged result in the iframe.
    """
    if not isinstance(overrides, dict) or not overrides:
        return ""
    lines: list[str] = []
    total = 0
    for key, val in list(overrides.items())[:STYLE_OVERRIDES_PROMPT_MAX_KEYS]:
        if not isinstance(key, str) or not key.strip():
            continue
        if isinstance(val, str) and val.strip():
            snippet = " ".join(val.strip().split())[:STYLE_OVERRIDES_PROMPT_SNIPPET_PER_KEY]
        else:
            snippet = repr(val)[:STYLE_OVERRIDES_PROMPT_SNIPPET_PER_KEY]
        line = f"- `{key.strip()}`: {snippet}"
        if total + len(line) > STYLE_OVERRIDES_PROMPT_MAX_TOTAL:
            break
        lines.append(line)
        total += len(line) + 1
    if not lines:
        return ""
    header = (
        "Runtime user style overrides (applied in the live preview after the base HTML/CSS loads; "
        "the user may see colors or text here that are NOT in the raw artifact files alone). "
        "When the user refers to colors, wording, or labels, treat these as the effective styling intent:"
    )
    return header + "\n" + "\n".join(lines)

POSITION_OVERRIDES_PROMPT_MAX_TOTAL = 2400

POSITION_OVERRIDES_PROMPT_MAX_KEYS = 30

def format_size_overrides_for_prompt(overrides: Any) -> str:
    """
    Summarize host-side sizeOverrides (per-element {sx, sy} scale factors)
    for LLM context. The user manually resized these elements via the 8-handle
    selection overlay; the override is applied as inline `transform: scale(...)`
    at render time, so the model usually does not see it in the static HTML
    we send. Tell the model what was resized so it does not undo the change.
    """
    if not isinstance(overrides, list) or not overrides:
        return ""
    lines: list[str] = []
    total = 0
    for entry in overrides[:POSITION_OVERRIDES_PROMPT_MAX_KEYS]:
        if not isinstance(entry, dict):
            continue
        try:
            sx = float(entry.get("sx"))
            sy = float(entry.get("sy"))
        except (TypeError, ValueError):
            continue
        if sx == 1 and sy == 1:
            continue
        label = entry.get("label") or entry.get("role") or entry.get("stableId") or "element"
        option_id = entry.get("optionId")
        suffix = f" (optionId={option_id})" if option_id else ""
        line = f"- {label}{suffix}: scale({sx:.3f}, {sy:.3f})"
        if total + len(line) > POSITION_OVERRIDES_PROMPT_MAX_TOTAL:
            break
        lines.append(line)
        total += len(line) + 1
    if not lines:
        return ""
    header = (
        "Runtime user size adjustments. The user manually resized these elements via "
        "the 8-handle selection overlay; the host re-applies these scale factors at "
        "render time as inline `transform: scale(...)`. PRESERVE the user's resized "
        "dimensions: do NOT emit conflicting width/height/transform:scale CSS for "
        "these elements unless the user's prompt explicitly asks to resize them. If "
        "the prompt explicitly resizes the affected element, do emit your new size "
        "and the host will detect the conflict and drop the manual override:"
    )
    return header + "\n" + "\n".join(lines)

def format_position_overrides_for_prompt(overrides: Any) -> str:
    """
    Summarize host-side positionOverrides (per-element {dx, dy} drag offsets)
    for LLM context. The current artifact HTML sent to the model already has
    the corresponding `style="transform: translate(...)"` baked in; this
    summary is a redundant, more legible representation that also instructs
    the model NOT to revert the offsets.
    """
    if not isinstance(overrides, list) or not overrides:
        return ""
    lines: list[str] = []
    total = 0
    for entry in overrides[:POSITION_OVERRIDES_PROMPT_MAX_KEYS]:
        if not isinstance(entry, dict):
            continue
        try:
            dx = float(entry.get("dx"))
            dy = float(entry.get("dy"))
        except (TypeError, ValueError):
            continue
        if dx == 0 and dy == 0:
            continue
        label = entry.get("label") or entry.get("role") or entry.get("stableId") or "element"
        option_id = entry.get("optionId")
        suffix = f" (optionId={option_id})" if option_id else ""
        line = f"- {label}{suffix}: translate({int(dx)}px, {int(dy)}px)"
        if total + len(line) > POSITION_OVERRIDES_PROMPT_MAX_TOTAL:
            break
        lines.append(line)
        total += len(line) + 1
    if not lines:
        return ""
    header = (
        "Runtime user position adjustments (already reflected in the artifact HTML as inline "
        "`style=\"transform: translate(...)\"` on the corresponding elements). The user dragged "
        "these elements to these offsets intentionally. PRESERVE the transforms exactly as written "
        "in the current HTML. Do NOT remove them, do NOT reset them to translate(0, 0), and do NOT "
        "rewrite the layout so the elements return to their original positions:"
    )
    return header + "\n" + "\n".join(lines)

def normalize_poll_game_plan(raw_text: str) -> dict[str, Any]:
    parsed = try_parse_json(raw_text)
    if parsed is None:
        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_text, re.IGNORECASE)
        if fenced and fenced.group(1):
            parsed = try_parse_json(fenced.group(1))
    if parsed is None:
        object_slice = extract_first_json_object(raw_text)
        if object_slice:
            parsed = try_parse_json(object_slice)

    if isinstance(parsed, list):
        return {
            "assistantMessage": "Applied parsed action list.",
            "actions": [item for item in parsed if isinstance(item, dict)],
        }

    if not isinstance(parsed, dict):
        return {
            "assistantMessage": (
                "AI response was not valid JSON. No structured actions were applied."
            ),
            "actions": [],
        }

    assistant_message = (
        parsed.get("assistantMessage")
        if isinstance(parsed.get("assistantMessage"), str)
        else parsed.get("message")
        if isinstance(parsed.get("message"), str)
        else "AI plan parsed."
    )
    actions_raw = parsed.get("actions")
    if not isinstance(actions_raw, list):
        for fallback_key in ("edits", "operations", "steps"):
            candidate = parsed.get(fallback_key)
            if isinstance(candidate, list):
                actions_raw = candidate
                break
    if not isinstance(actions_raw, list):
        actions_raw = []

    actions = [item for item in actions_raw if isinstance(item, dict)]
    return {"assistantMessage": assistant_message.strip(), "actions": actions}

def try_parse_json(value: str) -> Any | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None

def extract_first_json_object(raw_text: str) -> str:
    text = (raw_text or "").strip()
    if not text:
        return ""
    start = text.find("{")
    if start < 0:
        return ""

    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return ""

def normalize_poll_game_artifact_html(raw_text: str) -> str:
    text = (raw_text or "").strip()
    if not text:
        return ""

    for _ in range(3):
        changed = False
        direct = try_parse_json(text)
        if isinstance(direct, dict):
            html_field = direct.get("html")
            if isinstance(html_field, str) and html_field.strip():
                next_text = html_field.strip()
                if next_text != text:
                    text = next_text
                    changed = True
                    continue

        full_fence = ARTIFACT_MARKDOWN_FENCE_FULL_RE.match(text)
        if full_fence and full_fence.group(1):
            next_text = full_fence.group(1).strip()
            if next_text != text:
                text = next_text
                changed = True
                continue

        fenced_blocks = [
            match.group(1).strip()
            for match in ARTIFACT_MARKDOWN_FENCE_BLOCK_RE.finditer(text)
            if match.group(1) and match.group(1).strip()
        ]
        html_fenced_block = next(
            (
                block
                for block in fenced_blocks
                if ARTIFACT_HTML_SHAPE_RE.search(block)
            ),
            "",
        )
        if html_fenced_block and html_fenced_block != text:
            text = html_fenced_block
            changed = True
            continue

        if not changed:
            break

    if "```" in text:
        stripped_fence_lines = ARTIFACT_MARKDOWN_FENCE_LINE_RE.sub("", text).strip()
        if stripped_fence_lines and ARTIFACT_HTML_SHAPE_RE.search(stripped_fence_lines):
            text = stripped_fence_lines

    return text.strip()

def attempt_artifact_structural_autorepair(html: str) -> str:
    normalized = (html or "").strip()
    if not normalized:
        return normalized
    repaired_html, _changed = rebalance_artifact_script_tags(normalized)
    return repaired_html

def rebalance_artifact_script_tags(html: str) -> tuple[str, bool]:
    normalized = (html or "").strip()
    if not normalized:
        return normalized, False
    open_script_count = len(ARTIFACT_SCRIPT_OPEN_RE.findall(normalized))
    close_script_count = len(ARTIFACT_SCRIPT_CLOSE_RE.findall(normalized))
    if open_script_count == close_script_count:
        return normalized, False

    if open_script_count > close_script_count:
        missing_close_tags = open_script_count - close_script_count
        insertion = "</script>\n" * missing_close_tags
        if re.search(r"</body>", normalized, re.IGNORECASE):
            repaired = re.sub(
                r"</body>",
                f"{insertion}</body>",
                normalized,
                count=1,
                flags=re.IGNORECASE,
            )
        elif re.search(r"</html>", normalized, re.IGNORECASE):
            repaired = re.sub(
                r"</html>",
                f"{insertion}</html>",
                normalized,
                count=1,
                flags=re.IGNORECASE,
            )
        else:
            suffix = "" if normalized.endswith("\n") else "\n"
            repaired = f"{normalized}{suffix}{insertion}".rstrip()
        return repaired, repaired != normalized

    extra_close_tags = close_script_count - open_script_count
    repaired = normalized
    while extra_close_tags > 0:
        next_repaired = remove_last_artifact_script_close_tag(repaired)
        if next_repaired == repaired:
            break
        repaired = next_repaired
        extra_close_tags -= 1
    return repaired, repaired != normalized

def remove_last_artifact_script_close_tag(html: str) -> str:
    matches = list(ARTIFACT_SCRIPT_CLOSE_RE.finditer(html))
    if not matches:
        return html
    last_match = matches[-1]
    return f"{html[: last_match.start()]}{html[last_match.end() :]}"

# Reconciliation idioms that prove a renderer keys or clears rows instead of
# blindly appending. Shared by both kinds; the kind-specific tuples below add
# the option-/question-named variants.
_APPEND_ONLY_SHARED_RECONCILIATION_MARKERS = (
    r"\.replaceChildren\s*\(",
    r"\.innerHTML\s*=\s*['\"]\s*['\"]",
    r"\.textContent\s*=\s*['\"]\s*['\"]",
    r"data-id",
    r"\browsById\b",
    r"\browById\b",
    r"\bmountedRows\b",
    r"\bnew Map\s*\(",
    r"while\s*\([^)]*(?:firstChild|lastChild|childNodes)",
    r"\.forEach\s*\(\s*(?:function\s*\([^)]*\)|[^=)]+=>)\s*[^)]*\.remove\s*\(",
    r"\bexistingRows\b",
    r"\.children\.length",
    r"\.childNodes\.length",
)

_APPEND_ONLY_POLL_RECONCILIATION_MARKERS = _APPEND_ONLY_SHARED_RECONCILIATION_MARKERS + (
    r"data-option-id",
    r"data-prezo-option-id",
    r"\boptionNodesById\b",
    r"\bexistingOptions\b",
    r"\boptionElements\b",
    r"\boptionMap\b",
    r"\boptionById\b",
    r"\boptionNodes\b",
)

_APPEND_ONLY_QNA_RECONCILIATION_MARKERS = _APPEND_ONLY_SHARED_RECONCILIATION_MARKERS + (
    r"data-question-id",
    r"data-prezo-question-id",
    r"\bquestionNodesById\b",
    r"\bexistingQuestions\b",
    r"\bquestionElements\b",
    r"\bquestionMap\b",
    r"\bquestionById\b",
    r"\bquestionNodes\b",
)

def _detect_append_only_list_render_issue(
    script_body: str,
    *,
    hook_markers: tuple[str, ...],
    list_foreach_re: str,
    reconciliation_markers: tuple[str, ...],
    message: str,
) -> str | None:
    normalized = (script_body or "").strip()
    if not normalized:
        return None
    lowered = normalized.lower()
    if not any(marker in lowered for marker in hook_markers):
        return None
    if not re.search(list_foreach_re, normalized, re.IGNORECASE):
        return None
    if "appendChild" not in normalized or "createElement" not in normalized:
        return None
    if any(
        re.search(marker, normalized, re.IGNORECASE)
        for marker in reconciliation_markers
    ):
        return None
    return message

def detect_append_only_option_render_issue(script_body: str) -> str | None:
    return _detect_append_only_list_render_issue(
        script_body,
        hook_markers=("prezosetpollrenderer", "prezorenderpoll"),
        list_foreach_re=r"(?:poll\s*\.\s*options|state\s*\.\s*poll\s*\.\s*options|options)\s*\.\s*forEach\s*\(",
        reconciliation_markers=_APPEND_ONLY_POLL_RECONCILIATION_MARKERS,
        message=(
            "script appears to append option rows on each render without clear keyed reconciliation; "
            "repeated poll updates can duplicate rows."
        ),
    )

def detect_append_only_question_render_issue(script_body: str) -> str | None:
    """qna/discussion twin of detect_append_only_option_render_issue: renderers
    that append question rows on every update without keying duplicate them."""
    return _detect_append_only_list_render_issue(
        script_body,
        hook_markers=("prezosetqnarenderer", "prezorenderqna"),
        list_foreach_re=r"(?:qna\s*\.\s*questions|state\s*\.\s*qna\s*\.\s*questions|questions)\s*\.\s*forEach\s*\(",
        reconciliation_markers=_APPEND_ONLY_QNA_RECONCILIATION_MARKERS,
        message=(
            "script appears to append question rows on each render without clear keyed reconciliation; "
            "repeated Q&A updates can duplicate rows."
        ),
    )

_ARTIFACT_LIVE_STATE_ISSUE_BY_FAMILY = {
    "poll": "artifact output does not appear to consume live poll state.",
    "qna": "artifact output does not appear to consume live Q&A state.",
}

def validate_poll_game_artifact_html(html: str, activity_kind: str = "poll") -> list[str]:
    kind = normalize_artifact_activity_kind(activity_kind)
    family = artifact_activity_family(kind)
    text = (html or "").strip()
    if not text:
        return ["artifact output is empty."]

    issues: list[str] = []
    if "```" in text:
        issues.append("artifact output still contains markdown fences.")
    if not ARTIFACT_HTML_SHAPE_RE.search(text):
        issues.append("artifact output does not look like HTML.")
    if not contains_artifact_live_state_token(
        text, tokens=live_state_tokens_for_activity_kind(kind)
    ):
        issues.append(_ARTIFACT_LIVE_STATE_ISSUE_BY_FAMILY[family])
    open_script_count = len(ARTIFACT_SCRIPT_OPEN_RE.findall(text))
    close_script_count = len(ARTIFACT_SCRIPT_CLOSE_RE.findall(text))
    if open_script_count != close_script_count:
        issues.append("artifact output has unbalanced <script> tags.")

    for script_match in ARTIFACT_SCRIPT_RE.finditer(text):
        script_body = script_match.group("body").strip()
        if not script_body:
            continue
        for pattern, message in ARTIFACT_ESM_PATTERNS:
            if pattern.search(script_body):
                issues.append(message)
        for pattern, message in ARTIFACT_JSX_PATTERNS:
            if pattern.search(script_body):
                issues.append(message)
        for pattern, message in ARTIFACT_UNSAFE_DIRECT_DOM_PATTERNS:
            if pattern.search(script_body):
                issues.append(message)
        for pattern, message in ARTIFACT_FULL_SCENE_RESET_PATTERNS:
            if pattern.search(script_body):
                issues.append(message)
        append_only_issue = (
            detect_append_only_question_render_issue(script_body)
            if family == "qna"
            else detect_append_only_option_render_issue(script_body)
        )
        if append_only_issue:
            issues.append(append_only_issue)
        syntax_issue = validate_inline_script_syntax(script_body)
        if syntax_issue:
            issues.append(syntax_issue)

    deduped: list[str] = []
    seen: set[str] = set()
    for issue in issues:
        normalized = issue.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped

def contains_artifact_live_state_token(
    text: str, tokens: tuple[str, ...] = ARTIFACT_LIVE_STATE_TOKENS
) -> bool:
    normalized = (text or "").strip()
    if not normalized:
        return False
    return any(token in normalized for token in tokens)

def extract_artifact_live_hook_scripts(
    text: str, tokens: tuple[str, ...] = ARTIFACT_LIVE_STATE_TOKENS
) -> list[str]:
    normalized = (text or "").strip()
    if not normalized:
        return []
    hooks: list[str] = []
    seen: set[str] = set()
    for script_match in ARTIFACT_SCRIPT_RE.finditer(normalized):
        script_text = script_match.group(0).strip()
        if not script_text or not contains_artifact_live_state_token(script_text, tokens=tokens):
            continue
        if script_text in seen:
            continue
        seen.add(script_text)
        hooks.append(script_text)
    return hooks

def collect_context_artifact_live_hooks(context: dict[str, Any]) -> list[str]:
    artifact_context = context.get("artifact") if isinstance(context.get("artifact"), dict) else {}
    if not artifact_context:
        return []
    # Only the request's own kind counts as live wiring: a stray token from the
    # other kind's vocabulary must not masquerade as a preservable hook.
    tokens = live_state_tokens_for_activity_kind(resolve_artifact_activity_kind(context))
    current_html = artifact_context.get("currentArtifactHtml")
    current_hooks = artifact_context.get("currentArtifactLiveHooks")
    hooks = extract_artifact_live_hook_scripts(
        current_html if isinstance(current_html, str) else "", tokens=tokens
    )
    if hooks:
        return hooks
    return extract_artifact_live_hook_scripts(
        current_hooks if isinstance(current_hooks, str) else "", tokens=tokens
    )

def prepare_artifact_context_for_model(
    context: dict[str, Any], request_mode: str
) -> dict[str, Any]:
    if not isinstance(context, dict):
        return {}
    prepared = json.loads(json.dumps(context, ensure_ascii=False))
    artifact_context = (
        prepared.get("artifact") if isinstance(prepared.get("artifact"), dict) else None
    )
    if not artifact_context:
        return prepared
    current_artifact_markup = get_artifact_patch_source_html(artifact_context)
    artifact_context["currentArtifactHtml"] = compress_artifact_markup_for_model(
        current_artifact_markup,
        request_mode=request_mode,
    )
    artifact_context.pop("currentArtifactFullHtml", None)
    artifact_context.pop("currentArtifactPackage", None)
    artifact_context.pop("currentArtifactFullPackage", None)
    artifact_context.pop("failedArtifactPackage", None)
    artifact_context["failedArtifactHtml"] = compress_artifact_markup_for_model(
        artifact_context.get("failedArtifactHtml")
        if isinstance(artifact_context.get("failedArtifactHtml"), str)
        else "",
        request_mode=request_mode,
    )
    artifact_context["currentArtifactLiveHooks"] = compress_artifact_live_hooks_for_model(
        artifact_context.get("currentArtifactLiveHooks")
        if isinstance(artifact_context.get("currentArtifactLiveHooks"), str)
        else "",
    )
    if isinstance(artifact_context.get("recentEditRequests"), list):
        artifact_context["recentEditRequests"] = [
            trim_artifact_context_text(str(item), ARTIFACT_RECENT_EDIT_REQUEST_CHAR_LIMIT)
            for item in artifact_context["recentEditRequests"][-ARTIFACT_RECENT_EDIT_REQUEST_LIMIT:]
            if str(item).strip()
        ]
    for key in ("lastPrompt", "originalEditRequest", "runtimeRenderError", "pollTitle"):
        value = artifact_context.get(key)
        if isinstance(value, str):
            artifact_context[key] = trim_artifact_context_text(value, 1200)
    # Cap design guidelines to avoid overwhelming the model and crowding out
    # critical instructions (e.g. live poll-state consumption). Brand injection
    # uses an executive summary; this is a final safety net.
    dg = artifact_context.get("designGuidelines")
    if isinstance(dg, str) and len(dg) > ARTIFACT_DESIGN_GUIDELINES_CHAR_LIMIT:
        artifact_context["designGuidelines"] = trim_artifact_context_text(
            dg, ARTIFACT_DESIGN_GUIDELINES_CHAR_LIMIT
        )
    pbg = artifact_context.get("promptBrandGuidelines")
    if isinstance(pbg, str) and len(pbg) > ARTIFACT_PROMPT_BRAND_GUIDELINES_CHAR_LIMIT:
        artifact_context["promptBrandGuidelines"] = trim_artifact_context_text(
            pbg, ARTIFACT_PROMPT_BRAND_GUIDELINES_CHAR_LIMIT
        )
    bf = artifact_context.get("brandFacts")
    if bf is not None:
        artifact_context["brandFacts"] = compact_brand_facts_for_prompt(bf)
    attached_image_urls = extract_artifact_attached_image_urls(artifact_context)
    if attached_image_urls:
        artifact_context["attachedImageUrls"] = attached_image_urls
    else:
        artifact_context.pop("attachedImageUrls", None)
    raw_style = artifact_context.get("styleOverrides") or artifact_context.get("style_overrides")
    summary = format_style_overrides_for_prompt(raw_style)
    if summary:
        artifact_context["styleOverridesSummary"] = trim_artifact_context_text(
            summary, STYLE_OVERRIDES_PROMPT_MAX_TOTAL + 400
        )
    else:
        artifact_context.pop("styleOverridesSummary", None)
    artifact_context.pop("styleOverrides", None)
    artifact_context.pop("style_overrides", None)
    raw_positions = artifact_context.get("positionOverrides") or artifact_context.get(
        "position_overrides"
    )
    position_summary = format_position_overrides_for_prompt(raw_positions)
    if position_summary:
        artifact_context["positionOverridesSummary"] = trim_artifact_context_text(
            position_summary, POSITION_OVERRIDES_PROMPT_MAX_TOTAL + 400
        )
    else:
        artifact_context.pop("positionOverridesSummary", None)
    artifact_context.pop("positionOverrides", None)
    artifact_context.pop("position_overrides", None)
    raw_sizes = artifact_context.get("sizeOverrides") or artifact_context.get(
        "size_overrides"
    )
    size_summary = format_size_overrides_for_prompt(raw_sizes)
    if size_summary:
        artifact_context["sizeOverridesSummary"] = trim_artifact_context_text(
            size_summary, POSITION_OVERRIDES_PROMPT_MAX_TOTAL + 400
        )
    else:
        artifact_context.pop("sizeOverridesSummary", None)
    artifact_context.pop("sizeOverrides", None)
    artifact_context.pop("size_overrides", None)
    # Surface brand fields and attached image URLs early in JSON so the model sees
    # them before long HTML.
    bpn = artifact_context.get("brandProfileName")
    has_brand = isinstance(bpn, str) and bool(bpn.strip())
    if has_brand or attached_image_urls:
        first_keys = (
            "brandEnforcement",
            "brandProfileName",
            "promptBrandGuidelines",
            "brandFacts",
            "attachedImageUrls",
        )
        ordered_artifact: dict[str, Any] = {}
        for key in first_keys:
            if key in artifact_context:
                ordered_artifact[key] = artifact_context[key]
        for key, value in artifact_context.items():
            if key not in ordered_artifact:
                ordered_artifact[key] = value
        prepared["artifact"] = ordered_artifact
    return prepared

def build_stable_artifact_recovery_context(
    context: dict[str, Any], failed_html: str, validation_issues: list[str]
) -> dict[str, Any]:
    prepared = json.loads(json.dumps(context, ensure_ascii=False))
    artifact_context = (
        prepared.get("artifact") if isinstance(prepared.get("artifact"), dict) else None
    )
    if artifact_context is None:
        artifact_context = {}
        prepared["artifact"] = artifact_context
    artifact_context["requestMode"] = "repair"
    artifact_context["failedArtifactHtml"] = failed_html
    issue_text = "; ".join(issue.strip() for issue in validation_issues[:4] if issue.strip())
    existing_runtime_error = (
        artifact_context.get("runtimeRenderError")
        if isinstance(artifact_context.get("runtimeRenderError"), str)
        else ""
    )
    combined_runtime_error = ". ".join(
        part for part in (existing_runtime_error.strip(), issue_text.strip()) if part
    )
    artifact_context["runtimeRenderError"] = trim_artifact_context_text(
        combined_runtime_error,
        1200,
    )
    dg = artifact_context.get("designGuidelines")
    if isinstance(dg, str) and len(dg) > ARTIFACT_DESIGN_GUIDELINES_CHAR_LIMIT:
        artifact_context["designGuidelines"] = trim_artifact_context_text(
            dg, ARTIFACT_DESIGN_GUIDELINES_CHAR_LIMIT
        )
    return prepared

def build_artifact_completion_followup_context(
    *,
    context: dict[str, Any],
    patched_html: str,
    patched_package: dict[str, Any] | None,
    original_edit_request: str,
    missing_requirements: list[str],
) -> dict[str, Any]:
    prepared = json.loads(json.dumps(context, ensure_ascii=False))
    artifact_context = (
        prepared.get("artifact") if isinstance(prepared.get("artifact"), dict) else None
    )
    if artifact_context is None:
        artifact_context = {}
        prepared["artifact"] = artifact_context
    artifact_context["requestMode"] = "edit"
    normalized_html = (patched_html or "").strip()
    if normalized_html:
        artifact_context["currentArtifactFullHtml"] = normalized_html
        artifact_context["currentArtifactHtml"] = normalized_html
    if isinstance(patched_package, dict):
        artifact_context["currentArtifactPackage"] = patched_package
        artifact_context["currentArtifactFullPackage"] = patched_package
    missing_text = ", ".join(item.strip() for item in missing_requirements[:4] if item.strip())
    completion_error = (
        "The targeted patch only completed part of the request. "
        f"Unmet goals: {missing_text or 'unspecified requirements'}."
    )
    artifact_context["runtimeRenderError"] = trim_artifact_context_text(
        completion_error,
        1200,
    )
    if (original_edit_request or "").strip():
        artifact_context["originalEditRequest"] = trim_artifact_context_text(
            original_edit_request,
            1200,
        )
    dg = artifact_context.get("designGuidelines")
    if isinstance(dg, str) and len(dg) > ARTIFACT_DESIGN_GUIDELINES_CHAR_LIMIT:
        artifact_context["designGuidelines"] = trim_artifact_context_text(
            dg, ARTIFACT_DESIGN_GUIDELINES_CHAR_LIMIT
        )
    return prepared

def compress_artifact_markup_for_model(markup: str, *, request_mode: str) -> str:
    normalized = (markup or "").strip()
    if not normalized:
        return ""
    direct_limit = ARTIFACT_CONTEXT_DIRECT_CHAR_LIMIT
    combined_limit = ARTIFACT_CONTEXT_COMBINED_CHAR_LIMIT
    if request_mode == "edit":
        direct_limit = 18000
        combined_limit = 24000
    elif request_mode == "repair":
        direct_limit = 16000
        combined_limit = 22000
    if len(normalized) <= direct_limit:
        return normalized
    hook_scripts = "\n\n".join(extract_artifact_live_hook_scripts(normalized))
    head = normalized[:ARTIFACT_CONTEXT_HEAD_CHAR_LIMIT].strip()
    tail = normalized[-ARTIFACT_CONTEXT_TAIL_CHAR_LIMIT :].strip()
    combined = "\n\n<!-- artifact-context-cut -->\n\n".join(
        part for part in (head, hook_scripts, tail) if part
    )
    return trim_artifact_context_text(combined, combined_limit)

def compress_artifact_live_hooks_for_model(hook_text: str) -> str:
    normalized = (hook_text or "").strip()
    if not normalized:
        return ""
    extracted = extract_artifact_live_hook_scripts(normalized)
    joined = "\n\n".join(extracted) if extracted else normalized
    return trim_artifact_context_text(joined, ARTIFACT_LIVE_HOOK_CONTEXT_CHAR_LIMIT)

def inject_artifact_live_hook_scripts(html: str, hook_scripts: list[str]) -> str:
    normalized = (html or "").strip()
    if not normalized or not hook_scripts:
        return normalized
    injection = "\n\n".join(
        script_text for script_text in hook_scripts if script_text.strip()
    ).strip()
    if not injection:
        return normalized
    if re.search(r"</body>", normalized, re.IGNORECASE):
        return re.sub(
            r"</body>",
            f"{injection}\n</body>",
            normalized,
            count=1,
            flags=re.IGNORECASE,
        )
    if re.search(r"</html>", normalized, re.IGNORECASE):
        return re.sub(
            r"</html>",
            f"{injection}\n</html>",
            normalized,
            count=1,
            flags=re.IGNORECASE,
        )
    return f"{normalized}\n{injection}"

def restore_artifact_live_hooks_if_missing(html: str, context: dict[str, Any]) -> str:
    normalized = (html or "").strip()
    if not normalized:
        return normalized
    # Gate on the request's own kind so e.g. a poll artifact that lost its poll
    # wiring is still repaired even if a stray qna token survives somewhere.
    tokens = live_state_tokens_for_activity_kind(resolve_artifact_activity_kind(context))
    if contains_artifact_live_state_token(normalized, tokens=tokens):
        return normalized
    hook_scripts = collect_context_artifact_live_hooks(context)
    if not hook_scripts:
        return normalized
    return inject_artifact_live_hook_scripts(normalized, hook_scripts)

def trim_artifact_context_text(text: str, limit: int) -> str:
    normalized = (text or "").strip()
    if not normalized or limit <= 0 or len(normalized) <= limit:
        return normalized
    marker = "\n\n<!-- artifact-context-cut -->\n\n"
    head_chars = max(1, (limit - len(marker)) // 2)
    tail_chars = max(1, limit - len(marker) - head_chars)
    return f"{normalized[:head_chars].rstrip()}{marker}{normalized[-tail_chars:].lstrip()}"

def has_artifact_syntax_or_truncation_issue(validation_issues: list[str]) -> bool:
    if not validation_issues:
        return False
    for issue in validation_issues:
        normalized = issue.strip().lower()
        if not normalized:
            continue
        if "unbalanced <script>" in normalized:
            return True
        if "unterminated" in normalized:
            return True
        if "mismatched closing" in normalized:
            return True
        if "unexpected closing" in normalized:
            return True
        if "truncated" in normalized:
            return True
    return False

def should_attempt_stable_artifact_recovery(
    request_mode: str, validation_issues: list[str], context: dict[str, Any]
) -> bool:
    if request_mode not in {"edit", "repair"}:
        return False
    if not has_artifact_syntax_or_truncation_issue(validation_issues):
        return False
    artifact_context = context.get("artifact") if isinstance(context.get("artifact"), dict) else {}
    current_html = artifact_context.get("currentArtifactHtml")
    return isinstance(current_html, str) and bool(current_html.strip())

def resolve_artifact_max_repair_attempts(request_mode: str) -> int:
    if request_mode == "edit":
        return ARTIFACT_EDIT_MAX_REPAIR_ATTEMPTS
    if request_mode == "repair":
        return ARTIFACT_REPAIR_MODE_MAX_REPAIR_ATTEMPTS
    return min(ARTIFACT_MAX_REPAIR_ATTEMPTS, ARTIFACT_BUILD_MAX_REPAIR_ATTEMPTS)

def resolve_artifact_followup_reserve_seconds(request_mode: str) -> float:
    if request_mode == "edit":
        return ARTIFACT_EDIT_FOLLOWUP_RESERVE_SECONDS
    if request_mode == "repair":
        return ARTIFACT_REPAIR_FOLLOWUP_RESERVE_SECONDS
    return ARTIFACT_BUILD_FOLLOWUP_RESERVE_SECONDS

def ensure_artifact_time_budget_remaining(
    deadline: float,
    stage: str,
    *,
    minimum_seconds: float,
    reserve_seconds: float = 0.0,
) -> float:
    remaining = deadline - time.monotonic()
    available = remaining - max(0.0, reserve_seconds)
    if available >= minimum_seconds:
        return available
    raise HTTPException(
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
        detail=(
            f"Artifact request exceeded the server time budget while {stage}. "
            "Try a simpler edit or retry."
        ),
    )

def validate_inline_script_syntax(script_body: str) -> str:
    text = script_body or ""
    mode_stack: list[str] = ["code"]
    delimiter_stack: list[str] = []
    index = 0
    length = len(text)

    while index < length:
        mode = mode_stack[-1]
        char = text[index]
        next_char = text[index + 1] if index + 1 < length else ""

        if mode == "line_comment":
            if char in "\r\n":
                mode_stack.pop()
            index += 1
            continue

        if mode == "block_comment":
            if char == "*" and next_char == "/":
                mode_stack.pop()
                index += 2
                continue
            index += 1
            continue

        if mode == "single_quote":
            if char == "\\":
                index += 2
                continue
            if char == "'":
                mode_stack.pop()
            index += 1
            continue

        if mode == "double_quote":
            if char == "\\":
                index += 2
                continue
            if char == '"':
                mode_stack.pop()
            index += 1
            continue

        if mode == "template":
            if char == "\\":
                index += 2
                continue
            if char == "`":
                mode_stack.pop()
                index += 1
                continue
            if char == "$" and next_char == "{":
                delimiter_stack.append("${")
                mode_stack.append("code")
                index += 2
                continue
            index += 1
            continue

        if char == "/" and next_char == "/":
            mode_stack.append("line_comment")
            index += 2
            continue
        if char == "/" and next_char == "*":
            mode_stack.append("block_comment")
            index += 2
            continue
        if char == "'":
            mode_stack.append("single_quote")
            index += 1
            continue
        if char == '"':
            mode_stack.append("double_quote")
            index += 1
            continue
        if char == "`":
            mode_stack.append("template")
            index += 1
            continue
        if char in "({[":
            delimiter_stack.append(char)
            index += 1
            continue
        if char == "}":
            if delimiter_stack:
                top = delimiter_stack[-1]
                if top == "{":
                    delimiter_stack.pop()
                    index += 1
                    continue
                if top == "${":
                    delimiter_stack.pop()
                    if len(mode_stack) > 1:
                        mode_stack.pop()
                    index += 1
                    continue
                return f"script has mismatched closing `{char}`."
            return f"script has unexpected closing `{char}`."
        if char == ")":
            if not delimiter_stack:
                return f"script has unexpected closing `{char}`."
            top = delimiter_stack[-1]
            if top != "(":
                return f"script has mismatched closing `{char}`."
            delimiter_stack.pop()
            index += 1
            continue
        if char == "]":
            if not delimiter_stack:
                return f"script has unexpected closing `{char}`."
            top = delimiter_stack[-1]
            if top != "[":
                return f"script has mismatched closing `{char}`."
            delimiter_stack.pop()
            index += 1
            continue
        index += 1

    unfinished_mode = mode_stack[-1] if mode_stack else "code"
    if unfinished_mode == "single_quote":
        return "script has an unterminated single-quoted string."
    if unfinished_mode == "double_quote":
        return 'script has an unterminated double-quoted string.'
    if unfinished_mode == "template":
        return "script has an unterminated template literal."
    if unfinished_mode == "block_comment":
        return "script has an unterminated block comment."
    if unfinished_mode == "line_comment":
        mode_stack.pop()

    if delimiter_stack:
        top = delimiter_stack[-1]
        if top == "${":
            return "script has an unterminated template expression."
        if top == "{":
            return "script has an unterminated block or object literal."
        if top == "(":
            return "script has an unterminated parenthesized expression."
        if top == "[":
            return "script has an unterminated array or property access expression."

    return ""


ARTIFACT_JSX_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"\breturn\s*<\s*[A-Za-z]", re.IGNORECASE),
        "script appears to contain JSX/TSX (`return <Tag ...>`).",
    ),
    (
        re.compile(r"=>\s*<\s*[A-Za-z]", re.IGNORECASE),
        "script appears to contain JSX/TSX arrow-return markup.",
    ),
    (
        re.compile(r"=\s*<\s*[A-Za-z]", re.IGNORECASE),
        "script appears to assign JSX/TSX markup directly.",
    ),
)

ARTIFACT_ESM_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"^\s*import\s+.+$", re.MULTILINE),
        "script contains an `import` statement, which is not allowed in artifact output.",
    ),
    (
        re.compile(r"^\s*export\s+.+$", re.MULTILINE),
        "script contains an `export` statement, which is not allowed in artifact output.",
    ),
)

ARTIFACT_UNSAFE_DIRECT_DOM_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"\b(?:document\.)?(?:querySelector|getElementById|getElementsByClassName|getElementsByTagName)\s*\([^)]*\)\s*\.\s*(?:innerText|textContent|innerHTML)\b"
        ),
        "script reads or writes text/html directly from a raw DOM query result without a null guard.",
    ),
    (
        re.compile(
            r"\b(?:document\.)?(?:querySelector|getElementById|getElementsByClassName|getElementsByTagName)\s*\([^)]*\)\s*\.\s*style\b"
        ),
        "script mutates style directly on a raw DOM query result without a null guard.",
    ),
    (
        re.compile(
            r"\b(?:document\.)?(?:querySelector|getElementById|getElementsByClassName|getElementsByTagName)\s*\([^)]*\)\s*\.\s*(?:appendChild|removeChild|replaceChildren|insertBefore|insertAdjacentElement|insertAdjacentHTML|setAttribute|removeAttribute)\s*\("
        ),
        "script performs a DOM container mutation directly on a raw DOM query result without a null guard.",
    ),
    (
        re.compile(
            r"\b(?:document\.)?(?:querySelector|getElementById|getElementsByClassName|getElementsByTagName)\s*\([^)]*\)\s*\.\s*classList\s*\.\s*(?:add|remove|toggle|replace)\s*\("
        ),
        "script mutates classList directly on a raw DOM query result without a null guard.",
    ),
)

ARTIFACT_FULL_SCENE_RESET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"\b(?:window\.)?document\s*\.\s*(?:body|documentElement)\s*\.\s*(?:innerHTML|textContent)\s*="
        ),
        "script resets the full document/body content, which causes blank or flickering artifacts.",
    ),
    (
        re.compile(
            r"\b(?:window\.)?document\s*\.\s*(?:body|documentElement)\s*\.\s*(?:replaceChildren|replaceWith|appendChild|insertAdjacentHTML|insertAdjacentElement)\s*\("
        ),
        "script replaces the full document/body structure, which is not allowed for artifact output.",
    ),
    (
        re.compile(
            r"\bdocument\s*\.\s*querySelector\s*\(\s*['\"](?:body|html)['\"]\s*\)\s*\.\s*(?:innerHTML|textContent|replaceChildren|replaceWith|appendChild|insertAdjacentHTML|insertAdjacentElement)\b"
        ),
        "script rewrites the root document structure through querySelector(body/html), which is not allowed for artifact output.",
    ),
    (
        re.compile(
            r"\b(?:root|appRoot|sceneRoot|artifactRoot|stageRoot|mountNode|rootNode|scene|stage|container)\s*\.\s*innerHTML\s*="
        ),
        "script resets the main scene/root content, which causes hard resets, flicker, or blank artifacts.",
    ),
    (
        re.compile(
            r"\b(?:root|appRoot|sceneRoot|artifactRoot|stageRoot|mountNode|rootNode|scene|stage|container)\s*\.\s*(?:replaceChildren|replaceWith)\s*\("
        ),
        "script replaces the main scene/root structure, which is not allowed for smooth artifact updates.",
    ),
    (
        re.compile(
            r"\b(?:window\.)?document\s*\.\s*(?:getElementById|querySelector)\s*\(\s*['\"]#?(?:artifact-root|app|root|scene|stage|mount)['\"]\s*\)\s*\.\s*(?:innerHTML|replaceChildren|replaceWith)\b"
        ),
        "script rewrites a likely scene root node directly, which causes hard resets or flicker.",
    ),
)
