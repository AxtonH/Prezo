"""Conversational intake for the artifact wizard.

A small, cheap model (Haiku by default) chats with the user before the
expensive artifact build: it asks at most a handful of clarifying
questions, knows which brand profiles the user has saved (and asks which
one to apply when unspecified), then emits a structured creative brief
that the frontend maps onto the existing build context. Pure helpers
only; the provider call lives in app.api.ai.
"""

from __future__ import annotations

import json
from typing import Any

from .artifact_quality import extract_first_json_object, try_parse_json

ARTIFACT_INTAKE_MAX_QUESTIONS = 4
ARTIFACT_INTAKE_QUESTION_CHAR_LIMIT = 320
ARTIFACT_INTAKE_BRIEF_TEXT_CHAR_LIMIT = 1600
ARTIFACT_INTAKE_BRIEF_LIST_LIMIT = 8
ARTIFACT_INTAKE_BRAND_NAME_LIMIT = 30

INTAKE_NO_BRAND_TOKENS = {"", "none", "no brand", "no-brand", "nobrand", "null"}


def normalize_intake_brand_profile_names(names: Any) -> list[str]:
    if not isinstance(names, (list, tuple)):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in names:
        if not isinstance(raw, str):
            continue
        name = raw.strip()
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        normalized.append(name)
        if len(normalized) >= ARTIFACT_INTAKE_BRAND_NAME_LIMIT:
            break
    return normalized


def match_brand_profile_name(candidate: Any, brand_profile_names: list[str]) -> str:
    """Resolve a model- or user-supplied brand name to a saved profile name.

    Returns the canonical saved spelling, or "" when there is no match —
    the brief must never carry a brand name that does not exist.
    """
    if not isinstance(candidate, str):
        return ""
    wanted = candidate.strip().lower()
    if wanted in INTAKE_NO_BRAND_TOKENS:
        return ""
    for name in brand_profile_names:
        if name.strip().lower() == wanted:
            return name
    return ""


def build_artifact_intake_system_instruction(
    *,
    brand_profile_names: list[str],
    selected_brand_profile_name: str,
    questions_asked: int,
    max_questions: int = ARTIFACT_INTAKE_MAX_QUESTIONS,
    force_ready: bool = False,
) -> str:
    remaining = max(0, max_questions - questions_asked)

    if selected_brand_profile_name:
        brand_block = (
            f'- The user already chose the brand profile "{selected_brand_profile_name}". '
            'Do not ask about brands; set "brandProfileName" to exactly that value.'
        )
    elif brand_profile_names:
        listed = ", ".join(f'"{name}"' for name in brand_profile_names)
        brand_block = (
            f"- The user has these saved brand profiles: {listed}.\n"
            "- If the user has not said which brand to use (and has not declined one), "
            "ask early — usually as your first question — which brand profile to apply, "
            'listing the saved names and offering "no brand" as an option.\n'
            '- "brandProfileName" in the brief must be exactly one of the saved names, '
            'or "" when the user wants no brand.'
        )
    else:
        brand_block = (
            "- The user has no saved brand profiles. Never ask about brand profiles; "
            'set "brandProfileName" to "".'
        )

    lines = [
        "You are the intake assistant for Prezo's artifact editor. The user wants an",
        "AI-generated visual scene (an \"artifact\") that displays a live poll. Your job",
        "is to gather just enough creative direction for the designer model to build",
        "the best possible artifact on the first attempt.",
        "",
        "Rules:",
        "- Ask exactly ONE short, concrete question per turn, and only when its answer",
        "  would materially change the visual design (style, mood, brand, audience,",
        "  specific elements to include or avoid).",
        "- Never ask about poll mechanics, votes, data wiring, or technical details —",
        "  those are already handled.",
        "- Never re-ask something the user already answered, and never bundle multiple",
        "  questions into one turn.",
        f"- You may ask at most {remaining} more question(s). When nothing important",
        "  remains (or the user seems eager to proceed), stop asking and return the brief.",
        "",
        "Brand profiles:",
        brand_block,
        "",
        "Output format — reply with ONLY one JSON object, no prose, no markdown fences:",
        '- To ask a question: {"action": "ask", "question": "..."}',
        '- When ready to build: {"action": "ready", "brief": {',
        '    "artifactType": "short description of the scene/style the user wants (required)",',
        '    "designGuidelines": "consolidated visual guidance: colors, typography, mood, layout hints",',
        '    "brandProfileName": "exact saved profile name, or \\"\\" for none",',
        '    "audience": "who will see it, or \\"\\"",',
        '    "mustHaves": ["specific elements the user asked for"],',
        '    "avoid": ["things the user said to avoid"]',
        "  }}",
        "- The brief must faithfully consolidate what the user said. Do not invent",
        "  requirements the user never gave.",
    ]
    if force_ready:
        lines += [
            "",
            "IMPORTANT: The question budget is exhausted or the user asked to build now.",
            'You MUST return the {"action": "ready", ...} JSON using the information you',
            "have. Do not ask anything else.",
        ]
    return "\n".join(lines)


def build_artifact_intake_prompt(
    messages: list[dict[str, str]], poll_context: dict[str, Any] | None
) -> str:
    payload: dict[str, Any] = {
        "conversation": [
            {"role": message.get("role", ""), "text": message.get("text", "")}
            for message in messages
        ]
    }
    if isinstance(poll_context, dict) and poll_context:
        payload["pollContext"] = poll_context
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _clean_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:limit]


def _clean_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    items = [
        item.strip()[:ARTIFACT_INTAKE_BRIEF_TEXT_CHAR_LIMIT]
        for item in value
        if isinstance(item, str) and item.strip()
    ]
    return items[:ARTIFACT_INTAKE_BRIEF_LIST_LIMIT]


def build_fallback_intake_brief(
    messages: list[dict[str, str]],
    *,
    brand_profile_names: list[str],
    selected_brand_profile_name: str,
) -> dict[str, Any]:
    """Brief assembled directly from the user's own words when the model
    fails to produce one (parse failure, or it keeps asking past the cap)."""
    user_texts = [m.get("text", "").strip() for m in messages if m.get("role") == "user"]
    user_texts = [text for text in user_texts if text]
    artifact_type = user_texts[0] if user_texts else "poll artifact"
    extra = "\n".join(user_texts[1:])
    return {
        "artifactType": artifact_type[:ARTIFACT_INTAKE_BRIEF_TEXT_CHAR_LIMIT],
        "designGuidelines": extra[:ARTIFACT_INTAKE_BRIEF_TEXT_CHAR_LIMIT],
        "brandProfileName": match_brand_profile_name(
            selected_brand_profile_name, brand_profile_names
        )
        or (selected_brand_profile_name or "").strip(),
        "audience": "",
        "mustHaves": [],
        "avoid": [],
    }


def normalize_intake_brief(
    brief: Any,
    *,
    messages: list[dict[str, str]],
    brand_profile_names: list[str],
    selected_brand_profile_name: str,
) -> dict[str, Any]:
    fallback = build_fallback_intake_brief(
        messages,
        brand_profile_names=brand_profile_names,
        selected_brand_profile_name=selected_brand_profile_name,
    )
    if not isinstance(brief, dict):
        return fallback

    artifact_type = _clean_text(brief.get("artifactType"), ARTIFACT_INTAKE_BRIEF_TEXT_CHAR_LIMIT)
    if not artifact_type:
        artifact_type = fallback["artifactType"]

    # An explicit dropdown selection wins; otherwise the model's suggestion is
    # only honored when it names a profile that actually exists.
    if selected_brand_profile_name:
        brand_name = fallback["brandProfileName"]
    else:
        brand_name = match_brand_profile_name(
            brief.get("brandProfileName"), brand_profile_names
        )

    return {
        "artifactType": artifact_type,
        "designGuidelines": _clean_text(
            brief.get("designGuidelines"), ARTIFACT_INTAKE_BRIEF_TEXT_CHAR_LIMIT
        ),
        "brandProfileName": brand_name,
        "audience": _clean_text(brief.get("audience"), ARTIFACT_INTAKE_BRIEF_TEXT_CHAR_LIMIT),
        "mustHaves": _clean_text_list(brief.get("mustHaves")),
        "avoid": _clean_text_list(brief.get("avoid")),
    }


def normalize_artifact_intake_reply(
    raw_text: str,
    *,
    force_ready: bool,
    messages: list[dict[str, str]],
    brand_profile_names: list[str],
    selected_brand_profile_name: str,
) -> dict[str, Any]:
    """Turn the model's raw reply into {"action", "question", "brief"}.

    Degrades gracefully: unparseable replies become a question (when asking
    is still allowed) or a fallback brief (when the flow must conclude).
    """
    parsed = try_parse_json(raw_text)
    if not isinstance(parsed, dict):
        parsed = try_parse_json(extract_first_json_object(raw_text))

    def ready_reply(brief_value: Any) -> dict[str, Any]:
        return {
            "action": "ready",
            "question": None,
            "brief": normalize_intake_brief(
                brief_value,
                messages=messages,
                brand_profile_names=brand_profile_names,
                selected_brand_profile_name=selected_brand_profile_name,
            ),
        }

    if isinstance(parsed, dict):
        action = parsed.get("action")
        question = _clean_text(parsed.get("question"), ARTIFACT_INTAKE_QUESTION_CHAR_LIMIT)
        if action == "ask" and question and not force_ready:
            return {"action": "ask", "question": question, "brief": None}
        if action == "ready" or force_ready:
            return ready_reply(parsed.get("brief"))
        if question:
            return {"action": "ask", "question": question, "brief": None}
        return ready_reply(None)

    if force_ready:
        return ready_reply(None)

    plain = _clean_text(raw_text, ARTIFACT_INTAKE_QUESTION_CHAR_LIMIT)
    if plain:
        # The model answered in prose; treat a question-shaped reply as the
        # question rather than failing the turn.
        return {"action": "ask", "question": plain, "brief": None}
    return ready_reply(None)
