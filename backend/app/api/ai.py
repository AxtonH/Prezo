from __future__ import annotations

import base64
import json
import logging
import re
import time
import colorsys
from typing import Any, Callable

logger = logging.getLogger("prezo.ai")

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..auth import AuthUser, get_optional_library_user
from ..brand_context import (
    build_brand_context_from_profile,
    merge_brand_package_with_design_guidelines,
)
from ..deps import get_store
from ..store import InMemoryStore

from ..artifact_background import (  # noqa: F401  (re-exported for tests/backcompat)
    ARTIFACT_BACKGROUND_TREATMENT_SCRIPT_ID,
    apply_background_treatment_to_artifact_html,
    background_request_explicitly_allows_pale_palette,
    background_request_mentions_depth_layers,
    background_request_mentions_spires,
    background_request_mentions_windows,
    background_request_wants_extra_detail,
    blend_hex_colors,
    build_applied_background_treatment_assistant_message,
    build_artifact_background_treatment_prompt,
    clamp_int,
    color_luminance,
    default_background_palette,
    describe_background_time_of_day,
    extract_artifact_background_treatment_config_text,
    extract_background_edit_signature,
    format_hex_color,
    infer_background_composition_from_request,
    infer_background_time_of_day_from_request,
    normalize_artifact_background_treatment_plan,
    normalize_background_structure_controls,
    normalize_background_treatment,
    parse_artifact_background_treatment_config,
    parse_hex_color,
    serialize_artifact_background_treatment_config,
    should_fallback_to_generic_patch_after_background_treatment_failure,
    upsert_artifact_background_treatment_config,
    validate_background_edit_result,
)
from ..artifact_css_edit import (  # noqa: F401  (re-exported for tests/backcompat)
    ARTIFACT_STYLE_TAG_RE,
    build_css_rule,
    ensure_css_property_in_artifact_html,
    extract_combined_artifact_css_text,
    extract_css_rule_bodies_for_selector,
    find_matching_delimiter,
    has_css_property_for_selector,
    has_css_property_value_for_selector,
    set_css_property_in_artifact_html,
    set_css_property_in_css,
    upsert_css_rule_in_artifact_html,
    upsert_css_rule_in_css,
)
from ..artifact_css_tree import extract_selector_property_map
from ..artifact_edit_intent import (  # noqa: F401  (re-exported for tests/backcompat)
    ARTIFACT_BROAD_EDIT_REQUEST_RE,
    ARTIFACT_FEEDBACK_FOLLOWUP_RE,
    ARTIFACT_LAYOUT_ORIENTATION_EDIT_REQUEST_RE,
    ARTIFACT_PATCH_ONLY_EDIT_REQUEST_RE,
    ARTIFACT_STRUCTURAL_CSS_OVERRIDE_RE,
    ARTIFACT_STRUCTURAL_LOCAL_EDIT_REQUEST_RE,
    TITLE_COLOR_KEYWORDS,
    artifact_edit_request_requires_external_asset_url,
    classify_artifact_edit_request_scope,
    extract_title_requested_color_tokens,
    infer_requested_artifact_layout_orientation,
    infer_title_decoration_intent,
    is_artifact_feedback_followup_request,
    is_background_image_asset_edit_request,
    is_background_visual_edit_request,
    is_broad_artifact_edit_request,
    is_city_background_edit_request,
    is_layout_orientation_artifact_edit_request,
    is_patch_only_artifact_edit_request,
    is_title_decoration_only_request,
    is_title_overlap_spacing_artifact_edit_request,
    is_title_text_artifact_edit_request,
    normalize_requested_color_token,
    request_explicitly_wraps_title_in_container,
    resolve_artifact_edit_request_feedback,
)
from ..artifact_selectors import (  # noqa: F401  (re-exported for tests/backcompat)
    _extract_css_property_map_from_html,
    build_selector_context_map,
    choose_artifact_background_treatment_target_selector,
    choose_background_selector_candidate,
    choose_layout_selector_candidate,
    choose_scene_root_selector_candidate,
    choose_title_selector_candidate,
    ensure_generated_background_layer_in_artifact_html,
    extract_artifact_background_selector_candidates,
    extract_artifact_background_style_snippets,
    extract_artifact_layout_selector_candidates,
    extract_artifact_scene_root_selector_candidates,
    extract_artifact_style_rule_selectors,
    extract_artifact_title_selector_candidates,
    is_background_like_selector,
    is_explicit_background_layer_selector,
    is_layout_like_selector,
    is_primary_title_selector,
    is_title_like_selector,
    prefer_selectors_with_existing_css_rule,
    score_background_selector_candidate,
    score_layout_selector_candidate,
    score_scene_root_selector_candidate,
    score_title_selector_candidate,
)
from ..artifact_package import (
    ARTIFACT_PACKAGE_ENTRY_FILE,
    ARTIFACT_PACKAGE_RENDERER_FILE,
    ARTIFACT_PACKAGE_STYLES_FILE,
    build_segmented_artifact_package,
    materialize_artifact_html_from_package,
    sanitize_artifact_package,
)
from ..artifact_patch import (
    apply_artifact_patch_plan_to_package,
    normalize_artifact_patch_plan as normalize_artifact_patch_plan_payload,
)
from ..artifact_patch_plan import (  # noqa: F401  (re-exported for tests/backcompat)
    ARTIFACT_PATCH_BATCH_SIZE,
    ARTIFACT_PATCH_CANDIDATE_MAX_EDITS,
    ARTIFACT_PATCH_HTML_CHAR_LIMIT,
    ARTIFACT_PATCH_MAX_BATCHES,
    ARTIFACT_SCALE_AMOUNT_RE,
    ARTIFACT_SCALE_CSS_PROPERTIES,
    ARTIFACT_SCALE_INSIDE_POLL_RE,
    ARTIFACT_SCALE_INTENT_RE,
    ARTIFACT_SCALE_POLL_TARGET_RE,
    ARTIFACT_SCALE_UNIT_TARGET_RE,
    TITLE_TOP_DECORATION_DENSE_MIN_BOX_SHADOW_OFFSETS,
    _PSEUDO_SELECTOR_RE,
    _build_debug_patch_plan,
    _extract_first_class,
    _format_debug_edit,
    _html_suggests_parent_child,
    _inject_overflow_visible_for_clipped_elements,
    _is_valid_title_stud_rule_body,
    apply_artifact_patch_plan,
    apply_artifact_patch_plan_progressively,
    apply_string_artifact_patch_edit,
    build_artifact_patch_edit_prompt,
    chunk_artifact_patch_plan_edits,
    classify_rgb_color_family,
    collect_changed_scale_selectors,
    color_token_matches_css_text,
    compact_artifact_patch_plan_edits,
    dedupe_patch_issue_list,
    evaluate_artifact_completion_requirements,
    evaluate_artifact_patch_satisfaction,
    extract_artifact_css_declaration_map,
    extract_css_rgb_triplets,
    has_dense_repeating_decoration_pattern_in_css_body,
    has_dense_title_top_decoration_selector_rule,
    has_requested_title_color_in_css,
    has_title_top_decoration_selector_rule,
    infer_artifact_completion_requirements,
    infer_artifact_patch_satisfaction_requirements,
    is_poll_scale_selector,
    is_poll_unit_scale_selector,
    map_color_keyword_to_family,
    normalize_artifact_patch_plan,
    normalize_css_value_for_match,
    parse_css_rgb_component,
    rewrite_artifact_patch_plan_for_current_html,
    score_artifact_patch_edit_priority,
    should_accept_partial_patch_satisfaction_result,
    should_attempt_artifact_patch_edit,
    should_route_artifact_edit_to_anthropic,
    should_use_anthropic_for_artifact_patch_edit,
)
from ..artifact_quality import (  # noqa: F401  (re-exported for tests/backcompat)
    ARTIFACT_ATTACHED_IMAGE_URL_CHAR_LIMIT,
    ARTIFACT_ATTACHED_IMAGE_URL_LIMIT,
    ARTIFACT_BUILD_FOLLOWUP_RESERVE_SECONDS,
    ARTIFACT_BUILD_MAX_REPAIR_ATTEMPTS,
    ARTIFACT_CONTEXT_COMBINED_CHAR_LIMIT,
    ARTIFACT_CONTEXT_DIRECT_CHAR_LIMIT,
    ARTIFACT_CONTEXT_HEAD_CHAR_LIMIT,
    ARTIFACT_CONTEXT_TAIL_CHAR_LIMIT,
    ARTIFACT_DESIGN_GUIDELINES_CHAR_LIMIT,
    ARTIFACT_EDIT_FOLLOWUP_RESERVE_SECONDS,
    ARTIFACT_EDIT_MAX_REPAIR_ATTEMPTS,
    ARTIFACT_ESM_PATTERNS,
    ARTIFACT_FULL_SCENE_RESET_PATTERNS,
    ARTIFACT_HTML_SHAPE_RE,
    ARTIFACT_JSX_PATTERNS,
    ARTIFACT_LIVE_HOOK_CONTEXT_CHAR_LIMIT,
    ARTIFACT_LIVE_STATE_TOKENS,
    ARTIFACT_MARKDOWN_FENCE_BLOCK_RE,
    ARTIFACT_MARKDOWN_FENCE_FULL_RE,
    ARTIFACT_MARKDOWN_FENCE_LINE_RE,
    ARTIFACT_MAX_REPAIR_ATTEMPTS,
    ARTIFACT_PROMPT_BRAND_GUIDELINES_CHAR_LIMIT,
    ARTIFACT_RECENT_EDIT_REQUEST_CHAR_LIMIT,
    ARTIFACT_RECENT_EDIT_REQUEST_LIMIT,
    ARTIFACT_REPAIR_FOLLOWUP_RESERVE_SECONDS,
    ARTIFACT_REPAIR_MODE_MAX_REPAIR_ATTEMPTS,
    ARTIFACT_SCRIPT_CLOSE_RE,
    ARTIFACT_SCRIPT_OPEN_RE,
    ARTIFACT_SCRIPT_RE,
    ARTIFACT_UNSAFE_DIRECT_DOM_PATTERNS,
    POSITION_OVERRIDES_PROMPT_MAX_KEYS,
    POSITION_OVERRIDES_PROMPT_MAX_TOTAL,
    STYLE_OVERRIDES_PROMPT_MAX_KEYS,
    STYLE_OVERRIDES_PROMPT_MAX_TOTAL,
    STYLE_OVERRIDES_PROMPT_SNIPPET_PER_KEY,
    attempt_artifact_structural_autorepair,
    build_artifact_completion_followup_context,
    build_stable_artifact_recovery_context,
    collect_context_artifact_live_hooks,
    compact_brand_facts_for_prompt,
    compress_artifact_live_hooks_for_model,
    compress_artifact_markup_for_model,
    contains_artifact_live_state_token,
    detect_append_only_option_render_issue,
    ensure_artifact_time_budget_remaining,
    extract_artifact_attached_image_urls,
    extract_artifact_live_hook_scripts,
    extract_artifact_original_edit_request,
    extract_first_json_object,
    format_position_overrides_for_prompt,
    format_size_overrides_for_prompt,
    format_style_overrides_for_prompt,
    get_artifact_patch_source_html,
    get_artifact_patch_source_package,
    has_artifact_syntax_or_truncation_issue,
    inject_artifact_live_hook_scripts,
    normalize_poll_game_artifact_html,
    normalize_poll_game_plan,
    prepare_artifact_context_for_model,
    rebalance_artifact_script_tags,
    remove_last_artifact_script_close_tag,
    resolve_artifact_followup_reserve_seconds,
    resolve_artifact_max_repair_attempts,
    restore_artifact_live_hooks_if_missing,
    should_attempt_stable_artifact_recovery,
    trim_artifact_context_text,
    try_parse_json,
    validate_inline_script_syntax,
    validate_poll_game_artifact_html,
)
from ..config import settings
from ..models import ArtifactPackage

router = APIRouter(prefix="/ai", tags=["ai"])
DEFAULT_ANTHROPIC_ARTIFACT_BUILD_MODEL = "claude-sonnet-4-6"
ANTHROPIC_API_BASE = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_PLAN_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_ARTIFACT_EDIT_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_ARTIFACT_REPAIR_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_ARTIFACT_ANSWER_MODEL = "gemini-2.5-flash-lite"
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
ANTHROPIC_ARTIFACT_MAX_TOKENS = 16000
GEMINI_ARTIFACT_MAX_TOKENS = 16000
GEMINI_ARTIFACT_REPAIR_MAX_TOKENS = 12000
GEMINI_ARTIFACT_RECOVERY_MAX_TOKENS = 10000
GEMINI_ARTIFACT_PATCH_MAX_TOKENS = 8000
GEMINI_ARTIFACT_BACKGROUND_TREATMENT_MAX_TOKENS = 1200
ARTIFACT_MIN_INITIAL_CALL_TIMEOUT_SECONDS = 45.0
ARTIFACT_MIN_FOLLOWUP_CALL_TIMEOUT_SECONDS = 45.0
ARTIFACT_PATCH_MIN_CALL_TIMEOUT_SECONDS = 20.0
ARTIFACT_PATCH_TIMEOUT_SECONDS = 60.0
ARTIFACT_PATCH_FALLBACK_RESERVE_SECONDS = 120.0

POLL_GAME_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You translate user intent into JSON edit actions for a poll game canvas.",
        "Output JSON only, no markdown.",
        'Response shape: { "assistantMessage": string, "actions": Action[] }',
        "Supported actions:",
        '- { "type":"update_theme", "theme": { ... } }',
        '- { "type":"set_text", "target":"question|eyebrow", "value": string, "asHtml": boolean? }',
        '- { "type":"set_option_label", "optionIndex": number, "optionId": string?, "value": string, "asHtml": boolean? }',
        '- { "type":"move_element", "target": string, "x": number?, "y": number?, "deltaX": number?, "deltaY": number? }',
        '- { "type":"resize_element", "target": string, "width": number?, "height": number?, "scaleX": number?, "scaleY": number?, "scale": number? }',
        '- { "type":"reset_positions" }',
        '- { "type":"reset_theme" }',
        "Allowed theme keys: bgA, bgB, overlayColor, panelColor, panelBorder, textMain, textSub, "
        "trackColor, fillA, fillB, bgImageOpacity, overlayOpacity, gridOpacity, "
        "panelOpacity, trackOpacity, barHeight, barRadius, questionSize, labelSize, "
        "logoWidth, logoOpacity, assetWidth, assetOpacity, bgImageUrl, "
        "visualMode, artifactLayout, logoUrl, assetUrl, fontFamily.",
        "visualMode values: classic, artifact.",
        "artifactLayout values: horizontal, vertical.",
        "Allowed move targets: panel, eyebrow, question, meta, footer, options, logo, asset, bgImage, overlay, grid.",
        "Allowed resize targets: panel, eyebrow, question, meta, footer, logo, asset, bgImage, overlay, grid.",
        "Use hex colors only (#RRGGBB).",
        "If artifact mode is active, avoid applying predefined neon/pixel themes unless user explicitly asks.",
        "For prompts about vertical poll alignment in artifact mode, prefer artifactLayout='vertical'.",
        "Use context.artifact.pollTitle and context.artifact.dataEndpoints to design around live poll data.",
        "Use minimal actions required for the request.",
        "Do not invent keys, fields, or unsupported action types.",
    ]
)

POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You build complete interactive HTML artifacts for a live poll game canvas.",
        "Output must be raw HTML only. Do not output markdown, code fences, JSON wrappers, or explanations.",
        "The artifact runs inside a sandboxed iframe and receives live data from host messages.",
        "Runtime contract:",
        '- Host posts message: { "type":"prezo-poll-state", "payload": state }',
        "- State shape: state.poll.question, state.poll.options[], state.totalVotes, state.meta.",
        "- If available, use state.meta.expectedMaxVotes, state.meta.recommendedVisibleUnits, state.meta.recommendedVotesPerUnit, and state.meta.avoidOneToOneVoteObjects when designing scalable vote visuals.",
        "- Default poll visuals: use each option's votes and percentage (share of cast votes) from state.poll.options for bar/pie fill and labels; infer scaling from live data. Heuristic meta.expectedMaxVotes is optional for clustered or bucketed visuals, not a user-provided audience answer.",
        "- Prefer registering your renderer with window.prezoSetPollRenderer(fn) when available. You may also define window.prezoRenderPoll(state).",
        "- Do not implement your own window message listener or websocket logic for poll updates unless the user explicitly asks.",
        '- Use a stable main scene container marked with data-prezo-scene-root="true" whenever you build or substantially revise the artifact structure.',
        '- When the scene has a distinct background/backdrop layer, mark it with data-prezo-background-layer="true" so targeted background edits can modify it safely.',
        '- When feasible, keep the main interactive foreground content inside a container marked with data-prezo-foreground-layer="true".',
        "- If context.artifact.currentArtifactHtml is present, treat it as the current artifact to revise and return a full updated HTML artifact, not a diff.",
        "- If context.artifact.currentArtifactLiveHooks is present, preserve that live update wiring unless the user explicitly asks to replace it with an equivalent working implementation.",
        "- If context.artifact.requestMode == 'edit', treat the latest user request as a targeted refinement of the current artifact.",
        "- If context.artifact.requestMode == 'repair', treat context.artifact.currentArtifactHtml as the last stable working artifact, treat context.artifact.failedArtifactHtml as the broken prior attempt, and satisfy the latest edit request while avoiding context.artifact.runtimeRenderError.",
        "- In edit mode, make the smallest viable change that satisfies the latest request.",
        "- In repair mode, do not simply return the unchanged stable artifact unless the latest request is already satisfied.",
        "- In edit and repair mode, treat the current artifact as a working codebase. Patch it conservatively instead of reimagining it.",
        "- Preserve the current concept, layout, visual metaphor, typography, palette, and motion unless the user explicitly asks to change them.",
        "- Preserve detailed SVG or illustration markup, foreground art assets, decorative detail, and non-targeted motion logic unless the user explicitly asks to change them.",
        "- For local requests such as title size, spacing, readability, color, motion, or positioning, do not redesign unrelated parts of the artifact.",
        "- For local visual requests such as background, sky, time-of-day, lighting, or atmosphere changes, modify only background/backdrop/ambient layers and closely related color tokens unless the user explicitly asks to redesign foreground gameplay elements too.",
        "- In edit and repair mode, preserve existing container hierarchy, ids, classes, data attributes, and selector targets used by the current artifact unless the user explicitly asks for a structural redesign.",
        "- Do not rewrite the full document, <body>, primary scene root, or option row structure unless the user explicitly asks for a structural redesign.",
        "- Prefer CSS, copy, spacing, animation tuning, and small DOM adjustments over replacing major sections of the artifact.",
        "- Do not rename, remove, or relocate containers that current render logic depends on unless you also update that logic safely and equivalently.",
        "- Do not use document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, replaceWith, or equivalent full-scene reset operations as your live-update strategy.",
        "- Keep existing nodes mounted during live updates. Prefer updating text, classes, transforms, CSS variables, and inline styles in place whenever possible.",
        "- In edit and repair mode, preserve most of the existing HTML, CSS, and JavaScript byte-for-byte where possible. Change only the parts needed for the request.",
        "- If the user asks to reduce flicker, stop resets, or improve animation continuity, preserve the current DOM tree and animate existing option elements forward with transform/transition updates keyed by option id.",
        "- If context.artifact.recentEditRequests is present, use it to maintain continuity, but prioritize the latest request over earlier ones.",
        "- Preserve working live-data behavior, stable layout, and successful design decisions from the current artifact unless the user explicitly asks for a broader redesign.",
        "- The edited artifact must still consume host-delivered live poll state and must still call window.prezoSetPollRenderer(fn), define window.prezoRenderPoll(state), or use an equivalent runtime-approved render registration hook from the existing host contract.",
        "- The returned artifact must remain immediately usable after first render: visible poll scene, readable labels, and no empty, hidden, or near-solid full-screen overlay obscuring the content unless the user explicitly asks for that.",
        "- If you are unsure, keep more of the stable artifact and make a smaller targeted change.",
        "Update requirements:",
        "- Poll changes must animate smoothly (about 200ms-500ms easing) with no flicker.",
        "- Do not rebuild or re-mount the full scene on each update.",
        "- Never blank the stage between updates and never use hide-then-show, fade-to-black, blackout overlays, or other hard reset transitions unless the user explicitly asks for that effect.",
        "- Build around a stable scene root and persistent option nodes keyed by option id.",
        "- Reconcile by option id and update only changed elements when possible.",
        "- Renderer idempotence is required: repeated calls with the same or newer state must not increase option-row count or duplicate labels.",
        "- Do not reinsert or reorder every existing lane/row node with appendChild/removeChild on each update. If rank changes, animate vertical movement with transforms on stable mounted nodes.",
        "- If the scene contains moving objects such as cars, runners, avatars, or tokens, keep the same DOM nodes mounted and animate them forward from prior state instead of destroying and recreating them.",
        "Design guidance:",
        "- When context.artifact.promptBrandGuidelines is present, treat it as authoritative saved brand constraints (colors, typography, tone, voice, logo) for this artifact.",
        "- When context.artifact.brandFacts is present, use exact hex values, color role names, typography slots, and logo URL from it; brandFacts wins over vague paraphrases for those fields.",
        "- When context.artifact.brandProfileName is present, the host linked a saved brand profile; combine it with any free-text context.artifact.designGuidelines from the user.",
        "- Brand lock-in: when brandProfileName is present, palette, typography, logo placement, and voice from the brand package outrank decorative novelty. Do not substitute generic purple/teal gradients, stock fonts, or placeholder logos for specified hex colors, families, and logo URLs.",
        "- When context.artifact.brandEnforcement is 'strict', treat deviation from promptBrandGuidelines or brandFacts as a defect unless the user prompt explicitly overrides them or the brand package is technically impossible for HTML/CSS in the sandbox.",
        "- If brandFacts specifies a logo URL, include that logo in the artifact (placement per guidelines) unless the brand text explicitly says not to show it.",
        "- If context.artifact.attachedImageUrls is present (an array of public image URLs the user attached), decide how to use each based on the user's prompt wording.",
        "- Embed an attached image as an asset in the artifact (e.g. background-image: url(...), an <img src=\"...\"> element, or a CSS/SVG fill) when the user's language asks to USE or APPLY the image: phrases like 'use this image', 'use this photo', 'add this image', 'place this', 'insert this', 'as the background', 'use as background', 'put this in'. Use the exact attachedImageUrls string verbatim; do not modify, re-encode, shorten, or proxy it.",
        "- Treat an attached image as a STYLE REFERENCE ONLY (do not embed its URL) when the user's language is about matching its look: phrases like 'match this', 'like this', 'in the style of', 'inspired by', 'similar to', 'same vibe as'. In that case mirror its palette, composition, mood, and typography without showing the image itself.",
        "- When the user's intent is ambiguous, prefer style reference over embedding unless the prompt clearly asks to show or place the image.",
        "- Preserve any external asset URL already embedded in the current artifact (in background-image, src attributes, or inline styles), including attachedImageUrls baked in earlier, byte-for-byte unless the user explicitly asks to remove or replace it. This applies in edit and repair mode.",
        "- Prioritize user prompt intent over default templates.",
        "- Assume base poll chrome can be replaced by your artifact scene composition.",
        "- Express creative layout and motion in HTML, CSS, and JavaScript; when a brand package is present, it takes priority over generic creative defaults.",
        "- By default, produce a polished, presentation-quality artifact scene rather than a rough experiment.",
        "- Favor balanced composition, clear alignment, and strong visual hierarchy across the full 16:9 frame.",
        "- Keep important content comfortably inside the canvas with safe padding so nothing critical is clipped.",
        "- For layout in the sandboxed iframe, avoid vh/vw for primary bar heights and other critical vertical sizing: the host measures document size and resizes the iframe, which changes vh/vw and can cause jitter or feedback loops. Prefer % of a fixed scene root, flex, CSS grid with minmax(0, 1fr), or clamp(..., px, ...) — not vh — for vote bars and main columns.",
        "- Be expressive and creative, but avoid messy, chaotic, or gimmicky layouts unless the user explicitly asks for that.",
        "- Prioritize readability at all times: titles, poll labels, values, and motion should remain easy to understand at a glance.",
        "- Use animation with purpose: smooth, cinematic, and responsive to vote changes, but not noisy or distracting.",
        "- Avoid giant empty areas unless they clearly support the concept.",
        "- Keep decorative elements supportive of the information instead of competing with it.",
        "- When interpreting stylized prompts, preserve functional poll communication instead of sacrificing clarity for aesthetics.",
        "- During live updates, keep the overall structure stable and animate changes without flicker or full-scene resets.",
        "- Design vote visuals so they scale to larger audiences. Do not assume one visual object equals one vote unless the totals are very small.",
        "- If using discrete objects such as blocks, tokens, icons, or pieces, group them into scalable units and cap the visible count so the layout still works for 100+ votes.",
        "- Always preserve exact vote counts and percentages in text even when the main visual uses grouped or bucketed units.",
        "- Prefer proportion, grouped units, stacked segments, or bucketed representations over naive one-object-per-vote visuals.",
        "- Keep all scripts self-contained inside the generated HTML.",
        "- All inline JavaScript must be syntactically complete browser JavaScript with closed blocks, strings, templates, and script tags.",
        "- If you need the literal text </script> inside inline JavaScript, emit <\\/script> instead.",
        "- When outputting a segmented artifact package with separate renderer.js or styles.css files, do not include <script>, </script>, <style>, or </style> tags in those file contents. Those tags are only needed for inline scripts and styles in HTML. The package materializer wraps file contents in the appropriate tags automatically.",
        "- In window.prezoRenderPoll(state) or the function passed to window.prezoSetPollRenderer(fn), guard DOM queries before mutating them. If an element is temporarily missing, skip that mutation instead of throwing.",
        "- Never read from or write to .innerText, .textContent, .innerHTML, .style, or similar properties on the result of querySelector/getElementById without first checking that the element exists.",
        "- Never call appendChild, removeChild, replaceChildren, insertBefore, insertAdjacentElement, insertAdjacentHTML, setAttribute, removeAttribute, or classList mutations on a queried element unless the queried element was first stored and null-checked.",
        "- Do not output JSX, TSX, module import/export syntax, or unfinished code.",
        "- Do not require external libraries or network assets unless the user explicitly requests them.",
        "- Do not fetch poll data over HTTP yourself and do not open WebSockets for poll updates.",
        "- Build resilient rendering when options/votes change over time.",
    ]
)

POLL_GAME_ARTIFACT_ASSISTANT_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You are a text assistant for the Prezo artifact editor.",
        "Answer questions about the current artifact, its behavior, its live poll data, and likely causes of issues.",
        "Use the provided context.artifact.currentArtifactHtml and context.artifact.currentArtifactLiveHooks when helpful.",
        "Do not return HTML, CSS, JavaScript, JSON, markdown fences, or code unless the user explicitly asks for code.",
        "Do not redesign or rebuild the artifact when the user is asking a question.",
        "If the user asks an explanatory question, answer directly and concisely.",
        "If the answer depends on inference from the current artifact HTML, say so briefly.",
        "If the user is implicitly asking for a change rather than an explanation, explain that it should be treated as an edit request and suggest a precise edit phrasing.",
        "Keep answers short and practical.",
    ]
)

POLL_GAME_ARTIFACT_PATCH_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You generate minimal JSON patch plans for an existing live poll artifact.",
        "Output JSON only. Do not output markdown, code fences, prose, or full HTML.",
        'Response shape: { "assistantMessage": string, "edits": PatchEdit[] }',
        "Allowed PatchEdit objects:",
        '- { "type":"set_css_property", "file":"styles.css", "selector": string, "property": string, "value": string }',
        '- { "type":"insert_css_rule", "file":"styles.css", "selector": string, "css": string }  — adds a new CSS rule. "css" is the declarations body (no braces). If the selector already exists, new properties are merged.',
        '- { "type":"insert_html", "target": string, "position": "beforeend"|"afterbegin"|"beforebegin"|"afterend", "html": string }  — inserts HTML snippet relative to the first element matching "target" (a simple CSS selector: tag, #id, .class, or [attr]). No <script> tags or on* attributes allowed. Use this to add new visual elements (clouds, stars, decorations, SVG shapes, etc.). IMPORTANT: insert_html only operates on the static index.html file. Poll option elements (cards, rows, bars, labels) are created dynamically by renderer.js at runtime and do NOT exist in index.html. Do not use insert_html with selectors that target JS-generated option elements (e.g. .option-row, .card-header, .option-col, .bar-fill) — those selectors will not be found. To add per-option markup, you must output a full artifact rewrite that modifies the renderer JS where option nodes are built.',
        '- { "type":"replace_text", "file": "renderer.js"|"styles.css"|"index.html", "old": string, "new": string }  — performs a literal text replacement in the specified file. Replaces the first occurrence of "old" with "new". Use this for changes that cannot be expressed as CSS property edits, such as modifying JavaScript values (color hex codes, numeric constants, text strings, array entries) in renderer.js, or changing inline SVG attributes. The "old" value must be an EXACT substring found in the file. Keep replacements minimal and surgical — change only the specific value, not large blocks of code.',
        "Rules:",
        "- ATTACHED IMAGES: When the prompt's attached-image preamble lists exact public image URL(s), the user has supplied a real image. You MAY embed such a URL when the request asks to USE/ADD/PLACE/SET the image (e.g. set background-image: url(<exact-url>) via set_css_property on the background/backdrop layer, or insert an <img src=\"<exact-url>\"> via insert_html). Use the URL verbatim. This overrides the general 'do not use background-image / external URLs' guidance below, which applies only when NO attached image URL was provided. If the request only asks to MATCH or take inspiration from the attached image, do not embed it — adjust colors/composition to match instead.",
        "- You CAN create new visual elements using insert_html + insert_css_rule. Build shapes from simple HTML/CSS (divs with border-radius, box-shadow, gradients) or inline SVGs. Do NOT require external image URLs for simple shapes.",
        "- Prefer 1-12 edits for focused requests. If the request needs richer styling, emit the edits needed to satisfy the request while staying concise.",
        "- Preserve unrelated HTML, CSS, JavaScript, SVG, ids, classes, data attributes, and live poll wiring exactly.",
        "- The artifact is edited as a package with files: index.html, styles.css, renderer.js.",
        "- For set_css_property, use file='styles.css'.",
        "- Runtime preview: the host may apply per-field style overrides after the base HTML/CSS loads. "
        "When the prompt includes a \"runtime user style overrides\" block, use it to interpret colors or wording the user refers to that may not appear in the raw files alone.",
        "- SELECTOR TARGETING: Use the selector reference map provided in the prompt to pick the correct selector. "
        "When the user refers to an element by its visual name (e.g. 'the bricks', 'the polls', 'the options'), "
        "target the selector that directly owns the sizing properties (width, height, font-size, etc.) for that element. "
        "Do NOT target child/decoration sub-elements (e.g. studs, icons, labels) unless the user specifically asks for those. "
        "A parent selector like `.lego-brick` controls the whole brick; `.lego-brick .stud` is just the stud decoration on top.",
        "- For simple color/gradient background changes, use set_css_property on background/backdrop layers.",
        "- For visual additions (decorations, particles, effects, atmosphere — e.g. stars, nebulas, rain, snow, confetti, fireflies), "
        "use insert_html to create new DOM elements and insert_css_rule to style and animate them. "
        "Build from simple HTML/CSS shapes (divs with border-radius, box-shadow, gradients, opacity) or inline SVGs. "
        "Do NOT encode visuals into base64 data-URIs or background-image hacks — ALWAYS create real DOM elements instead.",
        "- Do NOT hide or remove existing elements (display:none, visibility:hidden, opacity:0) unless the user explicitly asks to remove them. "
        "When changing themes, restyle existing elements to fit the new look rather than hiding them.",
        "- Do not redesign or modify existing gameplay visuals (cars, avatars, icons, labels, vote chips, bricks, background decorations) unless the user explicitly asks.",
        "- Prefer set_css_property for color, lighting, spacing, and timing tweaks on CSS-styled elements.",
        "- Use replace_text for changes to JavaScript-embedded values: color hex codes in JS arrays/objects, SVG fill/stroke attributes generated by JS, numeric constants, text labels, or any value hardcoded in renderer.js that CSS cannot override. Example: to change a car color from red to yellow, use replace_text on renderer.js to swap the hex code.",
        "- If an element is visually clipped or hidden behind its parent, check for `overflow: hidden` on ancestor containers before adjusting z-index. "
        "Elements positioned outside their parent bounds (e.g. negative top/left) will be clipped by `overflow: hidden` regardless of z-index. "
        "Fix by setting `overflow: visible` on the clipping ancestor, or reposition the element within bounds.",
        "- Do not output a full rewritten artifact in JSON fields.",
        "- Never invent, guess, or fabricate third-party asset URLs.",
        "- If the request needs a new external image, photo, texture, or logo URL and the user did not provide a direct URL, return an empty edits array and explain that a direct asset URL is required.",
        "- If patch mode is not suitable, return an empty edits array and explain that in assistantMessage.",
    ]
)

POLL_GAME_ARTIFACT_PATCH_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "assistantMessage": {"type": "string"},
        "edits": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": [
                            "set_css_property",
                            "insert_css_rule",
                            "insert_html",
                            "replace_text",
                        ],
                    },
                    "file": {"type": "string"},
                    "selector": {"type": "string"},
                    "property": {"type": "string"},
                    "value": {"type": "string"},
                    "css": {"type": "string"},
                    "target": {"type": "string"},
                    "position": {"type": "string"},
                    "html": {"type": "string"},
                    "old": {"type": "string"},
                    "new": {"type": "string"},
                },
                "required": ["type"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["assistantMessage", "edits"],
    "additionalProperties": False,
}

POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You convert a user's background-only artifact request into a safe structured background treatment.",
        "Output JSON only. Do not output HTML, CSS, markdown, or explanations outside JSON.",
        'Response shape: { "assistantMessage": string, "treatment": BackgroundTreatment }',
        "Rules:",
        "- Preserve foreground gameplay visuals. Do not redesign cars, labels, badges, icons, or layout.",
        "- Do not invent external image URLs.",
        "- Use composition types that can be rendered safely with CSS only.",
        "- Choose colors with meaningful contrast. Avoid blank, washed-out, or near-white-only palettes unless the user explicitly asks for a pale/minimal white look.",
        "- For skyline requests, use real structural controls, not just colors: layerCount, buildingCount, heightVariance, windowDensity, spireFrequency, and roofVariation.",
        "- If the user asks for more detail, richer buildings, visible windows, rooflines, antennas, or spires, increase those structural controls instead of only changing colors.",
        "- Do not claim features like windows, spires, antennas, or multi-layer depth in assistantMessage unless the treatment values will actually render them.",
        "- If the prompt implies a skyline, city, or urban scene, prefer `skyline`.",
        "- If the prompt implies mountains or peaks, prefer `mountains`.",
        "- If the prompt implies desert, dunes, or sand, prefer `dunes`.",
        "- If the prompt implies clouds, haze, mist, or fog, prefer `clouds`.",
        "- Otherwise use `abstract`.",
        "- Use only hex colors in #RRGGBB format.",
    ]
)

POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "assistantMessage": {"type": "string"},
        "treatment": {
            "type": "object",
            "properties": {
                "composition": {
                    "type": "string",
                    "enum": ["abstract", "skyline", "mountains", "dunes", "clouds"],
                },
                "timeOfDay": {
                    "type": "string",
                    "enum": ["day", "golden-hour", "sunset", "night", "stormy"],
                },
                "intensity": {
                    "type": "string",
                    "enum": ["soft", "balanced", "dramatic"],
                },
                "topColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "midColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "bottomColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "silhouetteColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "accentColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "hazeColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "lightColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "horizonHeightPct": {"type": "integer", "minimum": 18, "maximum": 78},
                "detailDensity": {"type": "integer", "minimum": 10, "maximum": 90},
                "layerCount": {"type": "integer", "minimum": 2, "maximum": 4},
                "buildingCount": {"type": "integer", "minimum": 8, "maximum": 32},
                "heightVariance": {"type": "integer", "minimum": 10, "maximum": 95},
                "windowDensity": {"type": "integer", "minimum": 0, "maximum": 100},
                "spireFrequency": {"type": "integer", "minimum": 0, "maximum": 100},
                "roofVariation": {"type": "integer", "minimum": 0, "maximum": 100},
                "targetSelector": {"type": "string"},
            },
            "required": [
                "composition",
                "timeOfDay",
                "intensity",
                "topColor",
                "midColor",
                "bottomColor",
                "silhouetteColor",
                "accentColor",
                "hazeColor",
                "lightColor",
                "horizonHeightPct",
                "detailDensity",
                "layerCount",
                "buildingCount",
                "heightVariance",
                "windowDensity",
                "spireFrequency",
                "roofVariation",
            ],
            "additionalProperties": False,
        },
    },
    "required": ["assistantMessage", "treatment"],
    "additionalProperties": False,
}


class PollGameEditPlanRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=16000)
    context: dict[str, Any] = Field(default_factory=dict)
    model: str | None = Field(default=None, max_length=120)


class PollGameEditPlanResponse(BaseModel):
    text: str
    model: str


# Hard ceiling on a single reference image (decoded bytes). Matches the upload endpoint
# (MAX_ARTIFACT_IMAGE_BYTES) so anything that uploaded can also be referenced/embedded.
ARTIFACT_REFERENCE_IMAGE_MAX_RAW_BYTES = 10 * 1024 * 1024
# Images at or under this size are also sent as base64 VISION so the model can see them.
# Larger images (up to the 10MB hard cap) still embed via their hosted URL, but are NOT
# sent as base64 — this keeps a multi-image request under provider per-request inline-data
# ceilings (Gemini ~20MB total is the tightest) instead of failing the whole build.
ARTIFACT_REFERENCE_IMAGE_MAX_VISION_BYTES = 5 * 1024 * 1024
# Max images the model can SEE (base64 vision) per request. Inline image chips let a
# user attach one image per scene element (finajeen, dalleh, background, ...), so this
# is sized for multi-element prompts. The single constant flows to every enforcement
# site: the Pydantic reference_images gate, the Anthropic normalize slice, the build
# vision budget, and the edit/patch URL-fetch max_items.
ARTIFACT_REFERENCE_IMAGE_MAX_ITEMS = 6
ANTHROPIC_REFERENCE_IMAGE_MEDIA_TYPES: frozenset[str] = frozenset(
    {"image/png", "image/jpeg", "image/gif", "image/webp"}
)


class ArtifactReferenceImagePayload(BaseModel):
    """Base64 image data for initial artifact build (Anthropic vision)."""

    media_type: str = Field(default="image/png", max_length=48)
    # Base64 chars for up to a 10MB image (~1.34x). The normalize step then enforces the
    # decoded-byte caps (hard 10MB reject, >5MB skipped for vision but still embeddable).
    data: str = Field(..., min_length=20, max_length=14_000_000)


class PollGameArtifactBuildRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=16000)
    context: dict[str, Any] = Field(default_factory=dict)
    model: str | None = Field(default=None, max_length=120)
    brand_profile_name: str | None = Field(default=None, max_length=64)
    reference_images: list[ArtifactReferenceImagePayload] | None = Field(
        default=None,
        max_length=ARTIFACT_REFERENCE_IMAGE_MAX_ITEMS,
    )


class PollGameArtifactBuildResponse(BaseModel):
    html: str
    artifact_package: ArtifactPackage | None = None
    model: str
    assistantMessage: str
    debugPatchPlan: str | None = None


class PollGameArtifactAssistantResponse(BaseModel):
    text: str
    model: str


async def apply_brand_profile_name_to_context(
    request_context: dict[str, Any],
    brand_profile_name: str | None,
    library_user: AuthUser | None,
    store: InMemoryStore,
) -> None:
    """Load saved brand profile into artifact context: promptBrandGuidelines, brandFacts, optional designGuidelines merge."""
    if brand_profile_name is None:
        return
    normalized_name = " ".join(str(brand_profile_name).split()).strip()[:64]
    if not normalized_name:
        return
    if library_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization required when brand_profile_name is set",
        )
    profiles = await store.list_brand_profiles(library_user.id)
    profile = next((p for p in profiles if p.name == normalized_name), None)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="brand profile not found",
        )
    pkg = build_brand_context_from_profile(profile)
    artifact = request_context.get("artifact")
    if not isinstance(artifact, dict):
        artifact = {}
        request_context["artifact"] = artifact
    existing = artifact.get("designGuidelines")

    narrative = (profile.prompt_brand_guidelines or "").strip()
    facts = profile.brand_facts if isinstance(profile.brand_facts, dict) else {}
    artifact["brandProfileName"] = normalized_name
    artifact["brandEnforcement"] = "strict"
    artifact["promptBrandGuidelines"] = narrative
    artifact["brandFacts"] = compact_brand_facts_for_prompt(facts)

    if narrative:
        # User free text stays in designGuidelines only; authoritative brief is promptBrandGuidelines.
        if not isinstance(existing, str):
            artifact["designGuidelines"] = ""
    else:
        # No stored brief: legacy path — executive summary merged into designGuidelines (may duplicate tone in prompt).
        artifact["designGuidelines"] = merge_brand_package_with_design_guidelines(
            existing, pkg
        )


def build_provider_timeout_detail(
    provider_name: str,
    base_url: str,
    *,
    exception_name: str,
    timeout_seconds: float,
    request_stage: str = "",
    remaining_budget_seconds: float | None = None,
) -> str:
    stage_text = f" during {request_stage}" if request_stage else ""
    detail = (
        f"Unable to reach {provider_name} API at {base_url}{stage_text}: "
        f"{exception_name} after {timeout_seconds:.0f}s."
    )
    if remaining_budget_seconds is not None:
        detail = (
            f"{detail} Call budget was {timeout_seconds:.0f}s; "
            f"server budget remaining at call start was {max(0.0, remaining_budget_seconds):.0f}s."
        )
    return detail


def build_provider_request_error_detail(
    provider_name: str,
    base_url: str,
    detail: str,
    *,
    request_stage: str = "",
) -> str:
    stage_text = f" during {request_stage}" if request_stage else ""
    return f"Unable to reach {provider_name} API at {base_url}{stage_text}: {detail}"


def normalize_anthropic_reference_images(
    items: list[ArtifactReferenceImagePayload] | None,
) -> list[tuple[str, str]]:
    """Return (media_type, base64_data) tuples validated for size and decode."""
    if not items:
        return []
    out: list[tuple[str, str]] = []
    for it in items[:ARTIFACT_REFERENCE_IMAGE_MAX_ITEMS]:
        raw_b64 = str(it.data).strip()
        try:
            raw = base64.b64decode(raw_b64, validate=True)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="reference_images contains invalid base64 data.",
            ) from exc
        if len(raw) > ARTIFACT_REFERENCE_IMAGE_MAX_RAW_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each reference image must be at most 10MB after decoding.",
            )
        if len(raw) > ARTIFACT_REFERENCE_IMAGE_MAX_VISION_BYTES:
            # Too big to send as base64 vision; it still embeds via its hosted URL, so
            # skip it here rather than bloating the request past provider limits.
            logger.info(
                "Skipping base64 vision for a %d-byte reference image (> %d vision cap); URL embed still applies.",
                len(raw),
                ARTIFACT_REFERENCE_IMAGE_MAX_VISION_BYTES,
            )
            continue
        mt = str(it.media_type).strip().lower()
        if mt in {"image/jpg"}:
            mt = "image/jpeg"
        if mt not in ANTHROPIC_REFERENCE_IMAGE_MEDIA_TYPES:
            allowed = ", ".join(sorted(ANTHROPIC_REFERENCE_IMAGE_MEDIA_TYPES))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Unsupported reference_images media_type {it.media_type!r}. "
                    f"Allowed values: {allowed} (image/jpg is accepted as an alias for image/jpeg)."
                ),
            )
        out.append((mt, raw_b64))
    return out


def _normalize_fetched_image_media_type(content_type: str | None) -> str | None:
    """Map an HTTP Content-Type to an Anthropic-supported vision media type, or None."""
    mt = (content_type or "").strip().lower().split(";")[0]
    if mt == "image/jpg":
        mt = "image/jpeg"
    return mt if mt in ANTHROPIC_REFERENCE_IMAGE_MEDIA_TYPES else None


async def fetch_attached_images_as_reference_parts(
    urls: list[str],
    *,
    max_items: int,
    timeout_seconds: float = 15.0,
) -> list[tuple[str, str]]:
    """Best-effort: download attached image URLs and return (media_type, base64) vision parts.

    Lets the model actually *see* an attached image for style-matching even when the
    client only sent a URL (e.g. on edit/repair, where base64 is not resent). Failures
    (network, non-image, oversized, unsupported type) are skipped with a log rather than
    raised, so a bad URL degrades to no-vision instead of failing the whole build.
    """
    if not urls or max_items <= 0:
        return []
    out: list[tuple[str, str]] = []
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_seconds, connect=8.0),
            follow_redirects=True,
        ) as client:
            for url in urls[:max_items]:
                try:
                    response = await client.get(url)
                except Exception as exc:
                    logger.warning("Attached image fetch failed (network) %s: %s", url, exc)
                    continue
                if response.status_code != 200:
                    logger.warning(
                        "Attached image fetch HTTP %s for %s", response.status_code, url
                    )
                    continue
                media_type = _normalize_fetched_image_media_type(
                    response.headers.get("content-type")
                )
                if media_type is None:
                    logger.warning(
                        "Attached image %s has unsupported content-type %r; skipping vision",
                        url,
                        response.headers.get("content-type"),
                    )
                    continue
                raw = response.content
                # Use the vision threshold, not the hard embed cap: a large image still
                # embeds via its URL, but is skipped here to keep the request under
                # provider inline-data limits.
                if not raw or len(raw) > ARTIFACT_REFERENCE_IMAGE_MAX_VISION_BYTES:
                    logger.warning(
                        "Attached image %s is empty or exceeds %d vision bytes; skipping vision (URL embed still applies)",
                        url,
                        ARTIFACT_REFERENCE_IMAGE_MAX_VISION_BYTES,
                    )
                    continue
                out.append((media_type, base64.b64encode(raw).decode("ascii")))
    except Exception as exc:  # defensive: never let vision-fetch break a build
        logger.warning("Attached image fetch pass aborted: %s", exc)
    return out


def build_attached_image_preamble(attached_image_urls: list[str]) -> str:
    """Shared preamble telling the model how to use attached images.

    Used on initial build, edit (patch + full generation), and repair so the
    embed-vs-style-reference behavior is identical across providers.
    """
    lines = [
        "The user attached one or more image(s). Analyze them for visual style, layout density, "
        "color mood, typography weight, and overall composition.",
        "Decide how to use each image from the user's prompt wording: if the prompt asks to USE, ADD, "
        "PLACE, INSERT, or set the image (e.g. 'use as background'), embed it as an asset in the artifact; "
        "if the prompt asks to MATCH, mimic, or take inspiration from it (e.g. 'in the style of'), use it "
        "as a style reference only and do not embed it. When ambiguous, prefer style reference.",
    ]
    if attached_image_urls:
        lines.append(
            "When you embed an attached image, use one of these exact public URLs verbatim "
            "(do not modify them): " + "; ".join(attached_image_urls) + "."
        )
    lines.append(
        "If instructions conflict, follow mandatory brand guidelines and explicit text in context over the image."
    )
    return "\n".join(lines)


async def request_anthropic_text(
    *,
    api_key: str,
    model: str,
    system_instruction: str,
    prompt_text: str,
    temperature: float,
    max_tokens: int,
    timeout_seconds: float,
    request_stage: str = "",
    remaining_budget_seconds: float | None = None,
    reference_images: list[tuple[str, str]] | None = None,
) -> tuple[str, str]:
    base_url = resolve_anthropic_base_url()
    endpoint = f"{base_url}/messages"
    content: list[dict[str, Any]] = []
    if reference_images:
        for media_type, b64_data in reference_images:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": b64_data,
                    },
                }
            )
    content.append({"type": "text", "text": prompt_text})
    resolved_model = (
        normalize_anthropic_model_name(model) or DEFAULT_ANTHROPIC_ARTIFACT_BUILD_MODEL
    )
    body = {
        "model": resolved_model,
        "system": system_instruction,
        "messages": [
            {
                "role": "user",
                "content": content,
            }
        ],
        "max_tokens": max_tokens,
    }
    # Opus 4.7/4.8 reject temperature (400). Only send it on models that accept it.
    if anthropic_model_accepts_sampling_params(resolved_model):
        body["temperature"] = temperature

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_seconds, connect=10.0)
        ) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": ANTHROPIC_VERSION,
                },
                json=body,
            )
    except httpx.TimeoutException as exc:
        logger.error("Anthropic timeout: %s stage=%s timeout=%.1fs", exc.__class__.__name__, request_stage, timeout_seconds)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=build_provider_timeout_detail(
                "Anthropic",
                base_url,
                exception_name=exc.__class__.__name__,
                timeout_seconds=timeout_seconds,
                request_stage=request_stage,
                remaining_budget_seconds=remaining_budget_seconds,
            ),
        ) from exc
    except httpx.RequestError as exc:
        detail = str(exc).strip() or exc.__class__.__name__
        logger.error("Anthropic request error: %s stage=%s", detail, request_stage)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=build_provider_request_error_detail(
                "Anthropic",
                base_url,
                detail,
                request_stage=request_stage,
            ),
        ) from exc

    raw_payload: Any = {}
    if response.content:
        try:
            raw_payload = response.json()
        except ValueError:
            raw_payload = {}
    if response.status_code >= 400:
        detail = extract_anthropic_error(raw_payload) or (
            f"Anthropic request failed ({response.status_code})"
        )
        logger.error(
            "Anthropic API error: status=%s detail=%s model=%s stage=%s",
            response.status_code, detail, model, request_stage,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    text = extract_anthropic_text(raw_payload)
    stop_reason = extract_anthropic_stop_reason(raw_payload)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Anthropic response did not include text content.",
        )
    return text, stop_reason


async def request_gemini_text(
    *,
    api_key: str,
    model: str,
    system_instruction: str,
    prompt_text: str,
    temperature: float,
    max_tokens: int,
    timeout_seconds: float,
    request_stage: str = "",
    remaining_budget_seconds: float | None = None,
    response_mime_type: str | None = None,
    response_json_schema: dict[str, Any] | None = None,
    thinking_budget: int | None = None,
    vision_images: list[tuple[str, str]] | None = None,
) -> tuple[str, str]:
    base_url = resolve_gemini_base_url()
    endpoint = build_gemini_generate_content_endpoint(base_url, model)
    # Gemini vision parts: inlineData with base64 image, placed before the text part
    # so the model can SEE attached images (style-matching) in addition to the prompt.
    user_parts: list[dict[str, Any]] = []
    if vision_images:
        for media_type, b64_data in vision_images:
            user_parts.append(
                {
                    "inlineData": {
                        "mimeType": media_type,
                        "data": b64_data,
                    }
                }
            )
    user_parts.append({"text": prompt_text})
    body = {
        "systemInstruction": {
            "parts": [
                {
                    "text": system_instruction,
                }
            ]
        },
        "contents": [
            {
                "role": "user",
                "parts": user_parts,
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "candidateCount": 1,
        },
    }
    generation_config = body["generationConfig"]
    if response_mime_type:
        generation_config["responseMimeType"] = response_mime_type
    if response_json_schema:
        generation_config["responseJsonSchema"] = response_json_schema
    if thinking_budget is not None:
        generation_config["thinkingConfig"] = {
            "thinkingBudget": effective_gemini_thinking_budget(model, thinking_budget)
        }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_seconds, connect=10.0)
        ) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
                },
                json=body,
            )
    except httpx.TimeoutException as exc:
        logger.error("Gemini timeout: %s stage=%s timeout=%.1fs", exc.__class__.__name__, request_stage, timeout_seconds)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=build_provider_timeout_detail(
                "Gemini",
                base_url,
                exception_name=exc.__class__.__name__,
                timeout_seconds=timeout_seconds,
                request_stage=request_stage,
                remaining_budget_seconds=remaining_budget_seconds,
            ),
        ) from exc
    except httpx.RequestError as exc:
        detail = str(exc).strip() or exc.__class__.__name__
        logger.error("Gemini request error: %s stage=%s", detail, request_stage)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=build_provider_request_error_detail(
                "Gemini",
                base_url,
                detail,
                request_stage=request_stage,
            ),
        ) from exc

    raw_payload: Any = {}
    if response.content:
        try:
            raw_payload = response.json()
        except ValueError:
            raw_payload = {}
    if response.status_code >= 400:
        detail = extract_gemini_error(raw_payload) or f"Gemini request failed ({response.status_code})"
        logger.error(
            "Gemini API error: status=%s detail=%s model=%s stage=%s",
            response.status_code, detail, model, request_stage,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    text = extract_gemini_text(raw_payload)
    stop_reason = extract_gemini_stop_reason(raw_payload)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini response did not include text content.",
        )
    return text, stop_reason


@router.post("/poll-game-edit-plan", response_model=PollGameEditPlanResponse)
async def create_poll_game_edit_plan(
    payload: PollGameEditPlanRequest,
) -> PollGameEditPlanResponse:
    api_key = (settings.gemini_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI editor is not configured. Set GEMINI_API_KEY on backend.",
        )

    model = resolve_gemini_plan_model()
    text, _stop_reason = await request_gemini_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": payload.prompt, "context": payload.context},
            indent=2,
        ),
        temperature=0.2,
        max_tokens=1400,
        timeout_seconds=settings.gemini_plan_timeout_seconds,
        request_stage="poll game edit plan",
    )
    normalized_plan = normalize_poll_game_plan(text)

    return PollGameEditPlanResponse(
        text=json.dumps(normalized_plan, ensure_ascii=False),
        model=model,
    )


@router.post("/poll-game-artifact-build", response_model=PollGameArtifactBuildResponse)
async def create_poll_game_artifact_build(
    payload: PollGameArtifactBuildRequest,
    store: InMemoryStore = Depends(get_store),
    library_user: AuthUser | None = Depends(get_optional_library_user),
) -> PollGameArtifactBuildResponse:
    request_context = (
        json.loads(json.dumps(payload.context, ensure_ascii=False))
        if isinstance(payload.context, dict)
        else {}
    )
    await apply_brand_profile_name_to_context(
        request_context,
        payload.brand_profile_name,
        library_user,
        store,
    )
    artifact_context = (
        request_context.get("artifact")
        if isinstance(request_context.get("artifact"), dict)
        else {}
    )
    request_mode = str(artifact_context.get("requestMode") or "").strip().lower()
    is_initial_build = request_mode not in {"edit", "repair"}
    original_edit_request = extract_artifact_original_edit_request(
        artifact_context,
        payload.prompt,
    )
    model_context = prepare_artifact_context_for_model(request_context, request_mode)
    deadline = time.monotonic() + max(
        settings.gemini_artifact_total_timeout_seconds,
        ARTIFACT_MIN_INITIAL_CALL_TIMEOUT_SECONDS,
    )
    anthropic_api_key = (settings.anthropic_api_key or "").strip()
    gemini_api_key = (settings.gemini_api_key or "").strip()
    can_fallback_to_anthropic_edit = request_mode == "edit" and bool(anthropic_api_key)
    patch_failure_reasons: list[str] = []
    patch_debug: str = ""
    force_full_generation_after_patch = False
    if should_attempt_artifact_patch_edit(
        request_mode,
        artifact_context,
        original_edit_request,
    ):
        patch_api_key = gemini_api_key
        if patch_api_key:
            patch_model = resolve_gemini_artifact_edit_model()
            current_html = get_artifact_patch_source_html(artifact_context)
            current_package = get_artifact_patch_source_package(artifact_context)
            if current_package:
                materialized_current_html = materialize_artifact_html_from_package(
                    current_package,
                    fallback_html=current_html,
                ).strip()
                if materialized_current_html:
                    current_html = materialized_current_html
            try:
                remaining_budget_seconds = max(0.0, deadline - time.monotonic())
                patch_timeout_seconds = min(
                    ARTIFACT_PATCH_TIMEOUT_SECONDS,
                    ensure_artifact_time_budget_remaining(
                        deadline,
                        "starting artifact patch edit",
                        minimum_seconds=ARTIFACT_PATCH_MIN_CALL_TIMEOUT_SECONDS,
                        reserve_seconds=ARTIFACT_PATCH_FALLBACK_RESERVE_SECONDS,
                    ),
                )
                patch_html, patch_package, patch_assistant_message, patch_issues, patch_debug = await attempt_artifact_patch_edit(
                    api_key=patch_api_key,
                    model=patch_model,
                    original_edit_request=original_edit_request,
                    context=request_context,
                    current_html=current_html,
                    current_package=current_package,
                    timeout_seconds=patch_timeout_seconds,
                    remaining_budget_seconds=remaining_budget_seconds,
                    use_anthropic_patch_planner=False,
                )
                if patch_html:
                    patch_html = restore_artifact_live_hooks_if_missing(
                        patch_html, request_context
                    )
                    patch_html = attempt_artifact_structural_autorepair(patch_html)
                    patch_package = build_segmented_artifact_package(
                        patch_html,
                        patch_package,
                    )
                    patch_validation_issues = validate_poll_game_artifact_html(patch_html)
                    if not patch_validation_issues:
                        completion_requirements = infer_artifact_completion_requirements(
                            original_edit_request
                        )
                        completion_satisfied, missing_requirements = (
                            evaluate_artifact_completion_requirements(
                                requirements=completion_requirements,
                                before_html=current_html,
                                after_html=patch_html,
                            )
                        )
                        if completion_satisfied:
                            return PollGameArtifactBuildResponse(
                                html=patch_html,
                                artifact_package=patch_package,
                                model=patch_model,
                                assistantMessage=patch_assistant_message
                                or "Artifact updated with a targeted patch.",
                                debugPatchPlan=patch_debug or None,
                            )
                        force_full_generation_after_patch = True
                        missing_text = ", ".join(
                            item for item in missing_requirements[:3] if item
                        ) or "unspecified requirements"
                        patch_failure_reasons.append(
                            "patch updated artifact but missed part of the requested change "
                            f"({missing_text}); running a completion pass."
                        )
                        request_context = build_artifact_completion_followup_context(
                            context=request_context,
                            patched_html=patch_html,
                            patched_package=patch_package,
                            original_edit_request=original_edit_request,
                            missing_requirements=missing_requirements,
                        )
                        model_context = prepare_artifact_context_for_model(
                            request_context, request_mode
                        )
                    patch_failure_reasons.extend(patch_validation_issues)
                patch_failure_reasons.extend(patch_issues)
            except HTTPException:
                patch_failure_reasons.append("the patch edit request failed before a safe patch could be applied")
            if (
                request_mode == "edit"
                and anthropic_api_key
                and patch_failure_reasons
                and not force_full_generation_after_patch
            ):
                fallback_patch_model = resolve_anthropic_artifact_build_model()
                try:
                    remaining_budget_seconds = max(0.0, deadline - time.monotonic())
                    patch_timeout_seconds = min(
                        ARTIFACT_PATCH_TIMEOUT_SECONDS,
                        ensure_artifact_time_budget_remaining(
                            deadline,
                            "starting artifact patch edit fallback",
                            minimum_seconds=ARTIFACT_PATCH_MIN_CALL_TIMEOUT_SECONDS,
                        ),
                    )
                    fallback_html, fallback_package, fallback_assistant_message, fallback_issues, fallback_debug = (
                        await attempt_artifact_patch_edit(
                            api_key=anthropic_api_key,
                            model=fallback_patch_model,
                            original_edit_request=original_edit_request,
                            context=request_context,
                            current_html=current_html,
                            current_package=current_package,
                            timeout_seconds=patch_timeout_seconds,
                            remaining_budget_seconds=remaining_budget_seconds,
                            use_anthropic_patch_planner=True,
                        )
                    )
                    if fallback_debug:
                        patch_debug = f"[Anthropic fallback]\n{fallback_debug}"
                    if fallback_html:
                        fallback_html = restore_artifact_live_hooks_if_missing(
                            fallback_html, request_context
                        )
                        fallback_html = attempt_artifact_structural_autorepair(
                            fallback_html
                        )
                        fallback_package = build_segmented_artifact_package(
                            fallback_html,
                            fallback_package,
                        )
                        fallback_validation_issues = validate_poll_game_artifact_html(
                            fallback_html
                        )
                        if not fallback_validation_issues:
                            fallback_completion_requirements = (
                                infer_artifact_completion_requirements(
                                    original_edit_request
                                )
                            )
                            fallback_completion_satisfied, fallback_missing = (
                                evaluate_artifact_completion_requirements(
                                    requirements=fallback_completion_requirements,
                                    before_html=current_html,
                                    after_html=fallback_html,
                                )
                            )
                            if fallback_completion_satisfied:
                                return PollGameArtifactBuildResponse(
                                    html=fallback_html,
                                    artifact_package=fallback_package,
                                    model=fallback_patch_model,
                                    assistantMessage=fallback_assistant_message
                                    or "Artifact updated with a targeted patch.",
                                    debugPatchPlan=fallback_debug or None,
                                )
                            missing_text = ", ".join(
                                item for item in fallback_missing[:3] if item
                            ) or "unspecified requirements"
                            patch_failure_reasons.append(
                                "claude patch fallback updated artifact but missed part of the requested change "
                                f"({missing_text}); running a completion pass."
                            )
                            request_context = build_artifact_completion_followup_context(
                                context=request_context,
                                patched_html=fallback_html,
                                patched_package=fallback_package,
                                original_edit_request=original_edit_request,
                                missing_requirements=fallback_missing,
                            )
                            model_context = prepare_artifact_context_for_model(
                                request_context, request_mode
                            )
                        patch_failure_reasons.extend(fallback_validation_issues)
                    patch_failure_reasons.extend(fallback_issues)
                except HTTPException:
                    patch_failure_reasons.append(
                        "the claude patch fallback failed before a safe patch could be applied"
                    )

    if is_initial_build:
        build_api_key = anthropic_api_key
        if not build_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Artifact build is not configured. Set ANTHROPIC_API_KEY on backend.",
            )
        model = resolve_anthropic_artifact_build_model()
        temperature = 0.8
        remaining_budget_seconds = max(0.0, deadline - time.monotonic())
        timeout_seconds = min(
            settings.anthropic_artifact_build_timeout_seconds,
            ensure_artifact_time_budget_remaining(
                deadline,
                "starting artifact generation",
                minimum_seconds=ARTIFACT_MIN_INITIAL_CALL_TIMEOUT_SECONDS,
                reserve_seconds=resolve_artifact_followup_reserve_seconds(request_mode),
            ),
        )
        ref_parts: list[tuple[str, str]] = []
        if payload.reference_images:
            ref_parts = normalize_anthropic_reference_images(list(payload.reference_images))
        attached_image_urls = extract_artifact_attached_image_urls(artifact_context)
        # Let the model SEE attached images (for style-matching), not just read their
        # URL text. Fetch vision for the URLs only up to the remaining image budget so
        # client-sent reference_images still take priority.
        vision_budget = ARTIFACT_REFERENCE_IMAGE_MAX_ITEMS - len(ref_parts)
        if attached_image_urls and vision_budget > 0:
            fetched_parts = await fetch_attached_images_as_reference_parts(
                attached_image_urls,
                max_items=vision_budget,
            )
            if fetched_parts:
                ref_parts = ref_parts + fetched_parts
        prompt_text = json.dumps(
            {"prompt": payload.prompt, "context": model_context},
            indent=2,
        )
        if ref_parts or attached_image_urls:
            prompt_text = (
                build_attached_image_preamble(attached_image_urls) + "\n\n" + prompt_text
            )
        request_text, stop_reason = await request_anthropic_text(
            api_key=build_api_key,
            model=model,
            system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
            prompt_text=prompt_text,
            temperature=temperature,
            max_tokens=ANTHROPIC_ARTIFACT_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage="artifact initial build",
            remaining_budget_seconds=remaining_budget_seconds,
            reference_images=ref_parts or None,
        )
        generation_provider_name = "Anthropic"
    else:
        build_api_key = gemini_api_key
        if not build_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI editor is not configured. Set GEMINI_API_KEY on backend.",
            )
        model = resolve_gemini_artifact_edit_model()
        if request_mode == "repair":
            temperature = 0.2
            request_stage = "artifact repair generation"
            model = resolve_gemini_artifact_repair_model()
            configured_timeout_seconds = settings.gemini_artifact_repair_timeout_seconds
        else:
            temperature = 0.2
            request_stage = "artifact edit generation"
            configured_timeout_seconds = settings.gemini_artifact_edit_timeout_seconds
        remaining_budget_seconds = max(0.0, deadline - time.monotonic())
        timeout_seconds = min(
            configured_timeout_seconds,
            ensure_artifact_time_budget_remaining(
                deadline,
                "starting artifact generation",
                minimum_seconds=ARTIFACT_MIN_INITIAL_CALL_TIMEOUT_SECONDS,
                reserve_seconds=resolve_artifact_followup_reserve_seconds(request_mode),
            ),
        )
        # Edit/repair attached images: fetch as Gemini vision (so 'match the style'
        # works) and add the embed-vs-reference preamble, mirroring the build path.
        edit_attached_image_urls = extract_artifact_attached_image_urls(artifact_context)
        edit_vision_parts: list[tuple[str, str]] = []
        if edit_attached_image_urls:
            edit_vision_parts = await fetch_attached_images_as_reference_parts(
                edit_attached_image_urls,
                max_items=ARTIFACT_REFERENCE_IMAGE_MAX_ITEMS,
            )
        gemini_prompt_text = json.dumps(
            {"prompt": payload.prompt, "context": model_context},
            indent=2,
        )
        if edit_attached_image_urls:
            gemini_prompt_text = (
                build_attached_image_preamble(edit_attached_image_urls)
                + "\n\n"
                + gemini_prompt_text
            )
        request_text, stop_reason = await request_gemini_text(
            api_key=build_api_key,
            model=model,
            system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
            prompt_text=gemini_prompt_text,
            temperature=temperature,
            max_tokens=GEMINI_ARTIFACT_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage=request_stage,
            remaining_budget_seconds=remaining_budget_seconds,
            vision_images=edit_vision_parts or None,
        )
        generation_provider_name = "Gemini"

    html = normalize_poll_game_artifact_html(request_text)
    if not html:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{generation_provider_name} response did not include artifact HTML.",
        )
    html, validation_issues, response_model = (
        await validate_and_repair_artifact_html_candidate(
            html=html,
            stop_reason=stop_reason,
            request_mode=request_mode,
            original_prompt=original_edit_request or payload.prompt,
            prepared_context=model_context,
            request_context=request_context,
            deadline=deadline,
            initial_model=model,
        )
    )

    if validation_issues and can_fallback_to_anthropic_edit:
        fallback_model = resolve_anthropic_artifact_build_model()
        remaining_budget_seconds = max(0.0, deadline - time.monotonic())
        fallback_timeout_seconds = min(
            settings.anthropic_artifact_build_timeout_seconds,
            ensure_artifact_time_budget_remaining(
                deadline,
                "starting artifact edit fallback generation",
                minimum_seconds=ARTIFACT_MIN_FOLLOWUP_CALL_TIMEOUT_SECONDS,
            ),
        )
        fallback_text, fallback_stop_reason = await request_anthropic_text(
            api_key=anthropic_api_key,
            model=fallback_model,
            system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
            prompt_text=json.dumps(
                {"prompt": payload.prompt, "context": model_context},
                indent=2,
            ),
            temperature=0.35,
            max_tokens=ANTHROPIC_ARTIFACT_MAX_TOKENS,
            timeout_seconds=fallback_timeout_seconds,
            request_stage="artifact edit fallback generation",
            remaining_budget_seconds=remaining_budget_seconds,
        )
        fallback_html = normalize_poll_game_artifact_html(fallback_text)
        if fallback_html:
            (
                fallback_html,
                fallback_validation_issues,
                fallback_response_model,
            ) = await validate_and_repair_artifact_html_candidate(
                html=fallback_html,
                stop_reason=fallback_stop_reason,
                request_mode=request_mode,
                original_prompt=original_edit_request or payload.prompt,
                prepared_context=model_context,
                request_context=request_context,
                deadline=deadline,
                initial_model=fallback_model,
            )
            if not fallback_validation_issues:
                html = fallback_html
                validation_issues = []
                response_model = fallback_response_model
            else:
                html = fallback_html
                validation_issues = fallback_validation_issues
                response_model = fallback_response_model
        else:
            validation_issues = [
                "claude fallback response did not include artifact HTML."
            ] + validation_issues
    if validation_issues:
        issue_text = "; ".join(validation_issues[:4])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Artifact request failed validation: {issue_text}",
        )

    response_package = build_segmented_artifact_package(html)
    if response_package:
        html = materialize_artifact_html_from_package(
            response_package,
            fallback_html=html,
        )

    return PollGameArtifactBuildResponse(
        html=html,
        artifact_package=response_package,
        model=response_model,
        assistantMessage="Artifact ready. Keep prompting to iterate.",
        debugPatchPlan=patch_debug or None,
    )


@router.post("/poll-game-artifact-answer", response_model=PollGameArtifactAssistantResponse)
async def create_poll_game_artifact_answer(
    payload: PollGameArtifactBuildRequest,
    store: InMemoryStore = Depends(get_store),
    library_user: AuthUser | None = Depends(get_optional_library_user),
) -> PollGameArtifactAssistantResponse:
    api_key = (settings.gemini_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI editor is not configured. Set GEMINI_API_KEY on backend.",
        )

    request_context = (
        json.loads(json.dumps(payload.context, ensure_ascii=False))
        if isinstance(payload.context, dict)
        else {}
    )
    await apply_brand_profile_name_to_context(
        request_context,
        payload.brand_profile_name,
        library_user,
        store,
    )

    model = resolve_gemini_artifact_answer_model()
    text, _stop_reason = await request_gemini_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_ASSISTANT_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": payload.prompt, "context": request_context},
            indent=2,
        ),
        temperature=0.25,
        max_tokens=900,
        timeout_seconds=settings.gemini_artifact_answer_timeout_seconds,
        request_stage="artifact question answer",
    )

    answer = (text or "").strip()
    if not answer:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Artifact assistant returned an empty answer.",
        )

    return PollGameArtifactAssistantResponse(text=answer, model=model)


async def attempt_artifact_patch_edit(
    *,
    api_key: str,
    model: str,
    original_edit_request: str,
    context: dict[str, Any],
    current_html: str,
    current_package: dict[str, Any] | None,
    timeout_seconds: float,
    remaining_budget_seconds: float | None = None,
    use_anthropic_patch_planner: bool = False,
) -> tuple[str, dict[str, Any] | None, str, list[str], str]:
    artifact_context = context.get("artifact") if isinstance(context, dict) else None
    attached_image_urls = extract_artifact_attached_image_urls(
        artifact_context if isinstance(artifact_context, dict) else {}
    )
    # Only bail for "needs an image URL" when the user did NOT attach one. With an
    # attached image present, the planner can embed that exact URL instead.
    if not attached_image_urls and artifact_edit_request_requires_external_asset_url(
        original_edit_request
    ):
        return (
            "",
            current_package,
            "This edit needs a direct image URL. Provide the exact image URL and the editor can swap only the requested background image.",
            ["the requested edit needs a direct external image URL."],
            "",
        )
    patch_prompt = build_artifact_patch_edit_prompt(
        original_edit_request=original_edit_request,
        context=context,
        current_html=current_html,
    )
    # Surface attached images to the patch planner: the exact URL(s) to embed (text)
    # plus the image bytes as vision so it can match style. Mirrors the build path.
    patch_vision_parts: list[tuple[str, str]] = []
    if attached_image_urls:
        patch_prompt = (
            build_attached_image_preamble(attached_image_urls) + "\n\n" + patch_prompt
        )
        patch_vision_parts = await fetch_attached_images_as_reference_parts(
            attached_image_urls,
            max_items=ARTIFACT_REFERENCE_IMAGE_MAX_ITEMS,
        )
    if use_anthropic_patch_planner:
        text, _stop_reason = await request_anthropic_text(
            api_key=api_key,
            model=model,
            system_instruction=POLL_GAME_ARTIFACT_PATCH_SYSTEM_INSTRUCTION,
            prompt_text=patch_prompt,
            temperature=0.1,
            max_tokens=GEMINI_ARTIFACT_PATCH_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage="artifact patch edit",
            remaining_budget_seconds=remaining_budget_seconds,
            reference_images=patch_vision_parts or None,
        )
    else:
        try:
            text, _stop_reason = await request_gemini_text(
                api_key=api_key,
                model=model,
                system_instruction=POLL_GAME_ARTIFACT_PATCH_SYSTEM_INSTRUCTION,
                prompt_text=patch_prompt,
                temperature=0.1,
                max_tokens=GEMINI_ARTIFACT_PATCH_MAX_TOKENS,
                timeout_seconds=timeout_seconds,
                request_stage="artifact patch edit",
                remaining_budget_seconds=remaining_budget_seconds,
                response_mime_type="application/json",
                response_json_schema=POLL_GAME_ARTIFACT_PATCH_JSON_SCHEMA,
                thinking_budget=0,
                vision_images=patch_vision_parts or None,
            )
        except HTTPException as exc:
            if not is_gemini_schema_state_overflow_error_detail(exc.detail):
                raise
            text, _stop_reason = await request_gemini_text(
                api_key=api_key,
                model=model,
                system_instruction=POLL_GAME_ARTIFACT_PATCH_SYSTEM_INSTRUCTION,
                prompt_text=patch_prompt,
                temperature=0.1,
                max_tokens=GEMINI_ARTIFACT_PATCH_MAX_TOKENS,
                timeout_seconds=timeout_seconds,
                request_stage="artifact patch edit",
                remaining_budget_seconds=remaining_budget_seconds,
                response_mime_type="application/json",
                thinking_budget=0,
                vision_images=patch_vision_parts or None,
            )
    raw_plan = normalize_artifact_patch_plan_payload(text)
    plan = rewrite_artifact_patch_plan_for_current_html(
        plan=raw_plan,
        current_html=current_html,
        original_edit_request=original_edit_request,
    )
    debug_patch_plan = _build_debug_patch_plan(text, raw_plan, plan)
    patched_html, patched_package, issues = apply_artifact_patch_plan_progressively(
        current_html=current_html,
        current_package=current_package,
        plan=plan,
        original_edit_request=original_edit_request,
        context=context,
    )
    if issues:
        return "", current_package, plan.get("assistantMessage", ""), issues, debug_patch_plan
    return patched_html, patched_package, plan.get("assistantMessage", ""), [], debug_patch_plan


async def attempt_artifact_background_treatment_edit(
    *,
    api_key: str,
    model: str,
    original_edit_request: str,
    context: dict[str, Any],
    current_html: str,
    timeout_seconds: float,
    remaining_budget_seconds: float | None = None,
    use_anthropic: bool = False,
) -> tuple[str, str, list[str]]:
    prompt = build_artifact_background_treatment_prompt(
        original_edit_request=original_edit_request,
        context=context,
        current_html=current_html,
    )
    if use_anthropic:
        text, _stop_reason = await request_anthropic_text(
            api_key=api_key,
            model=model,
            system_instruction=POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_SYSTEM_INSTRUCTION,
            prompt_text=prompt,
            temperature=0.15,
            max_tokens=GEMINI_ARTIFACT_BACKGROUND_TREATMENT_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage="artifact background treatment",
            remaining_budget_seconds=remaining_budget_seconds,
        )
    else:
        text, _stop_reason = await request_gemini_text(
            api_key=api_key,
            model=model,
            system_instruction=POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_SYSTEM_INSTRUCTION,
            prompt_text=prompt,
            temperature=0.15,
            max_tokens=GEMINI_ARTIFACT_BACKGROUND_TREATMENT_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage="artifact background treatment",
            remaining_budget_seconds=remaining_budget_seconds,
            response_mime_type="application/json",
            response_json_schema=POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_JSON_SCHEMA,
            thinking_budget=0,
        )
    plan = normalize_artifact_background_treatment_plan(text)
    treatment = plan.get("treatment") if isinstance(plan.get("treatment"), dict) else {}
    if not treatment:
        fallback_treatment = normalize_background_treatment({}, original_edit_request)
        treated_html, issues = apply_background_treatment_to_artifact_html(
            current_html=current_html,
            treatment=fallback_treatment,
            original_edit_request=original_edit_request,
        )
        if not issues:
            applied_config = parse_artifact_background_treatment_config(treated_html)
            return (
                treated_html,
                build_applied_background_treatment_assistant_message(
                    applied_config or fallback_treatment, original_edit_request
                ),
                [],
            )
        return "", plan.get("assistantMessage", ""), [
            "background treatment planner returned no usable treatment."
        ] + issues
    treated_html, issues = apply_background_treatment_to_artifact_html(
        current_html=current_html,
        treatment=treatment,
        original_edit_request=original_edit_request,
    )
    if issues:
        return "", plan.get("assistantMessage", ""), issues
    applied_config = parse_artifact_background_treatment_config(treated_html)
    return (
        treated_html,
        build_applied_background_treatment_assistant_message(
            applied_config or normalize_background_treatment(treatment, original_edit_request),
            original_edit_request,
        ),
        [],
    )


async def attempt_artifact_repair(
    *,
    api_key: str,
    model: str,
    original_prompt: str,
    context: dict[str, Any],
    html: str,
    validation_issues: list[str],
    timeout_seconds: float,
    remaining_budget_seconds: float | None = None,
) -> str:
    if not validation_issues or ARTIFACT_MAX_REPAIR_ATTEMPTS <= 0:
        return ""
    repair_prompt = build_artifact_repair_prompt(
        original_prompt=original_prompt,
        context=context,
        html=html,
        validation_issues=validation_issues,
    )
    text, _stop_reason = await request_gemini_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
        prompt_text=repair_prompt,
        temperature=0.25,
        max_tokens=GEMINI_ARTIFACT_REPAIR_MAX_TOKENS,
        timeout_seconds=timeout_seconds,
        request_stage="artifact validation repair",
        remaining_budget_seconds=remaining_budget_seconds,
    )
    repaired = normalize_poll_game_artifact_html(text)
    return repaired.strip()


async def attempt_artifact_stable_recovery(
    *,
    api_key: str,
    model: str,
    original_prompt: str,
    context: dict[str, Any],
    validation_issues: list[str],
    timeout_seconds: float,
    remaining_budget_seconds: float | None = None,
) -> tuple[str, str]:
    recovery_prompt = build_artifact_stable_recovery_prompt(
        original_prompt=original_prompt,
        context=context,
        validation_issues=validation_issues,
    )
    text, stop_reason = await request_gemini_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": recovery_prompt, "context": context},
            indent=2,
        ),
        temperature=0.15,
        max_tokens=GEMINI_ARTIFACT_RECOVERY_MAX_TOKENS,
        timeout_seconds=timeout_seconds,
        request_stage="artifact stable recovery",
        remaining_budget_seconds=remaining_budget_seconds,
    )
    recovered = normalize_poll_game_artifact_html(text)
    return recovered.strip(), stop_reason


async def validate_and_repair_artifact_html_candidate(
    *,
    html: str,
    stop_reason: str,
    request_mode: str,
    original_prompt: str,
    prepared_context: dict[str, Any],
    request_context: dict[str, Any],
    deadline: float,
    initial_model: str,
) -> tuple[str, list[str], str]:
    next_html = restore_artifact_live_hooks_if_missing(html, request_context)
    next_html = attempt_artifact_structural_autorepair(next_html)
    validation_issues = validate_poll_game_artifact_html(next_html)

    # In edit/repair mode, don't block on validation issues that already existed
    # in the source artifact — the user's edit shouldn't be rejected for
    # pre-existing problems they didn't introduce.
    if request_mode in {"edit", "repair"} and validation_issues:
        source_artifact = (
            request_context.get("artifact", {}).get("currentArtifactHtml")
            if isinstance(request_context.get("artifact"), dict)
            else None
        )
        if isinstance(source_artifact, str) and source_artifact.strip():
            pre_existing_issues = set(
                validate_poll_game_artifact_html(source_artifact)
            )
            if pre_existing_issues:
                validation_issues = [
                    issue
                    for issue in validation_issues
                    if issue not in pre_existing_issues
                ]

    if stop_reason in {"max_tokens", "model_context_window_exceeded"}:
        validation_issues.insert(
            0,
            "artifact output appears truncated before completion.",
        )

    max_repair_attempts = resolve_artifact_max_repair_attempts(request_mode)
    repair_attempts = 0
    response_model = initial_model
    while validation_issues and repair_attempts < max_repair_attempts:
        repair_api_key = (settings.gemini_api_key or "").strip()
        if not repair_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Artifact repair is not configured. Set GEMINI_API_KEY on backend.",
            )
        repair_model = resolve_gemini_artifact_repair_model()
        remaining_budget_seconds = max(0.0, deadline - time.monotonic())
        repair_timeout_seconds = min(
            settings.gemini_artifact_repair_timeout_seconds,
            ensure_artifact_time_budget_remaining(
                deadline,
                "repairing artifact output",
                minimum_seconds=ARTIFACT_MIN_FOLLOWUP_CALL_TIMEOUT_SECONDS,
            ),
        )
        repaired_html = await attempt_artifact_repair(
            api_key=repair_api_key,
            model=repair_model,
            original_prompt=original_prompt,
            context=prepared_context,
            html=next_html,
            validation_issues=validation_issues,
            timeout_seconds=repair_timeout_seconds,
            remaining_budget_seconds=remaining_budget_seconds,
        )
        if not repaired_html:
            break
        candidate_html = restore_artifact_live_hooks_if_missing(
            repaired_html, request_context
        )
        candidate_html = attempt_artifact_structural_autorepair(candidate_html)
        if candidate_html.strip() == next_html.strip():
            break
        next_html = candidate_html
        validation_issues = validate_poll_game_artifact_html(next_html)
        repair_attempts += 1
        response_model = repair_model

    if should_attempt_stable_artifact_recovery(
        request_mode, validation_issues, request_context
    ):
        repair_api_key = (settings.gemini_api_key or "").strip()
        if not repair_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Artifact repair is not configured. Set GEMINI_API_KEY on backend.",
            )
        repair_model = resolve_gemini_artifact_repair_model()
        recovery_context = build_stable_artifact_recovery_context(
            request_context,
            failed_html=next_html,
            validation_issues=validation_issues,
        )
        prepared_recovery_context = prepare_artifact_context_for_model(
            recovery_context, "repair"
        )
        remaining_budget_seconds = max(0.0, deadline - time.monotonic())
        recovery_timeout_seconds = min(
            90.0,
            ensure_artifact_time_budget_remaining(
                deadline,
                "recovering artifact output from the last stable artifact",
                minimum_seconds=ARTIFACT_MIN_FOLLOWUP_CALL_TIMEOUT_SECONDS,
            ),
        )
        recovered_html, recovered_stop_reason = await attempt_artifact_stable_recovery(
            api_key=repair_api_key,
            model=repair_model,
            original_prompt=original_prompt,
            context=prepared_recovery_context,
            validation_issues=validation_issues,
            timeout_seconds=recovery_timeout_seconds,
            remaining_budget_seconds=remaining_budget_seconds,
        )
        if recovered_html:
            next_html = restore_artifact_live_hooks_if_missing(
                recovered_html, request_context
            )
            next_html = attempt_artifact_structural_autorepair(next_html)
            validation_issues = validate_poll_game_artifact_html(next_html)
            response_model = repair_model
            if recovered_stop_reason in {"max_tokens", "model_context_window_exceeded"}:
                validation_issues.insert(
                    0,
                    "artifact output appears truncated before completion.",
                )

    return next_html, validation_issues, response_model


def build_artifact_repair_prompt(
    *,
    original_prompt: str,
    context: dict[str, Any],
    html: str,
    validation_issues: list[str],
) -> str:
    has_truncation_issue = any(
        "truncated" in issue.lower() or "unbalanced <script>" in issue.lower()
        for issue in validation_issues
    )
    has_reconciliation_issue = any(
        "append option rows" in issue.lower() or "keyed reconciliation" in issue.lower()
        for issue in validation_issues
    )
    is_background_edit = bool(
        re.search(
            r"\b(?:background|backdrop|sky|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|day\b|night\b)\b",
            original_prompt,
            re.IGNORECASE,
        )
    )
    issue_text = "; ".join(issue.strip() for issue in validation_issues[:6] if issue.strip())
    return "\n".join(
        [
            "Artifact repair task",
            "You are repairing a broken HTML poll artifact that failed validation.",
            "Your job is to return one complete replacement artifact that is valid, usable, and still satisfies the original request.",
            "",
            "Repair objective",
            f"- Original prompt: {original_prompt}",
            f"- Validation issues: {issue_text}",
            "- Preserve the intended concept, layout, and live poll behavior unless one of them is the direct cause of the failure.",
            "- Prioritize correctness and usability over decorative complexity. A simpler working artifact is better than a flashy broken one.",
            "",
            "Required output contract",
            "- Return raw HTML only.",
            "- Return exactly one complete HTML document.",
            "- Do not return markdown fences, JSON, prose, comments outside HTML, or explanation.",
            "- Close every tag, especially every <script> tag.",
            "- Inline JavaScript must be syntactically complete with closed blocks, parentheses, strings, template literals, and object literals.",
            "- Preserve or restore the live poll contract: window.prezoSetPollRenderer(fn), window.prezoRenderPoll(state), or equivalent approved host wiring.",
            "- The artifact must render visible usable content on first load.",
            "",
            *(
                [
                    "Reconciliation fix (CRITICAL — this is why the artifact failed):",
                    "The renderer uses options.forEach + appendChild without clearing or keying, which duplicates rows on each poll update.",
                    "You MUST use one of these two approaches inside the poll renderer function:",
                    "  Approach A — Clear before appending: Before the options.forEach loop, add:  while (container.firstChild) container.removeChild(container.firstChild);",
                    "  Approach B — Key by option id: On each option row element, set data-option-id=option.id. Before creating a new row, check if one with that id already exists and reuse it.",
                    "Do NOT use replaceChildren() or innerHTML='' on the scene root as that would destroy the whole scene.",
                    "Apply the fix to the options container element only.",
                    "",
                ]
                if has_reconciliation_issue
                else []
            ),
            "Repair strategy",
            "- If a script block is malformed, truncated, or hard to salvage, rewrite the entire affected script block cleanly instead of trying to patch a fragment.",
            "- Keep the existing scene root and stable mounted nodes whenever possible.",
            "- Update text, classes, transforms, styles, and child nodes conservatively instead of rebuilding the whole scene.",
            "- Preserve unrelated foreground gameplay visuals, SVG art, decorative detail, labels, and motion logic unless the original request explicitly asks to change them.",
            (
                "- This request is about background, time-of-day, lighting, or atmosphere. Modify only background/backdrop/sky/ambient layers and closely related color tokens unless the request explicitly asks to change foreground gameplay visuals too."
                if is_background_edit
                else ""
            ),
            "- If a previous change introduced complexity that is causing breakage, simplify that section while preserving the main visual idea.",
            (
                "- The failed output appears truncated. Re-emit a complete artifact with all closing tags, all </script> tags, and fully complete JavaScript."
                if has_truncation_issue
                else ""
            ),
            "",
            "Pitfalls to avoid",
            "- Do not drop the live poll renderer registration.",
            "- Do not output partial HTML.",
            "- Do not leave unfinished object literals, arrays, function bodies, or conditionals.",
            "- Do not emit the literal text </script> inside inline JavaScript. Use <\\/script> instead if needed.",
            "- Do not rewrite the full document/body/root structure with document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, replaceWith, or equivalent hard resets.",
            "- Do not return a blank stage, near-solid black screen, or hidden content.",
            "",
            "Context JSON:",
            json.dumps(context, indent=2),
            "",
            "Broken artifact HTML to repair:",
            html,
        ]
    )


def build_artifact_stable_recovery_prompt(
    *,
    original_prompt: str,
    context: dict[str, Any],
    validation_issues: list[str],
) -> str:
    is_background_edit = bool(
        re.search(
            r"\b(?:background|backdrop|sky|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|day\b|night\b)\b",
            original_prompt,
            re.IGNORECASE,
        )
    )
    issue_text = "; ".join(issue.strip() for issue in validation_issues[:6] if issue.strip())
    return "\n".join(
        [
            "Artifact stable recovery task",
            "The previous edited artifact output is invalid and must be discarded.",
            "Reapply the requested change against the last stable current artifact from context.artifact.currentArtifactHtml.",
            "Return one complete replacement artifact that is valid, usable, and still satisfies the original request.",
            "",
            "Recovery objective",
            f"- Original prompt: {original_prompt}",
            f"- Validation issues to avoid: {issue_text}",
            "- Use the stable current artifact as the baseline.",
            "- Do not preserve malformed code, truncated code, or unfinished script bodies from the failed output.",
            "- Prioritize a safe working result over ambitious redesign.",
            "",
            "Required output contract",
            "- Return raw HTML only.",
            "- Return exactly one complete HTML document.",
            "- Preserve the live poll contract and renderer registration.",
            "- Ensure every <script> tag is closed and every JavaScript block, object, array, string, template literal, and expression is complete.",
            "- The artifact must render visible usable content on first load.",
            "",
            "Recovery strategy",
            "- Reapply the requested change conservatively to the stable artifact.",
            "- Keep the existing scene root, option nodes, and mounted structure whenever possible.",
            "- Preserve unrelated foreground gameplay visuals, SVG art, decorative detail, labels, and motion logic unless the original request explicitly asks to change them.",
            (
                "- This request is about background, time-of-day, lighting, or atmosphere. Modify only background/backdrop/sky/ambient layers and closely related color tokens unless the request explicitly asks to change foreground gameplay visuals too."
                if is_background_edit
                else ""
            ),
            "- If the requested change caused instability, implement the smallest robust version of that change instead of repeating the failed approach.",
            "- If a broken script cannot be trusted, replace the entire affected script block with a clean complete version.",
            "",
            "Pitfalls to avoid",
            "- Do not output markdown fences, JSON, or explanation.",
            "- Do not preserve malformed script bodies, unfinished JavaScript expressions, or unbalanced <script> tags from the failed output.",
            "- Do not emit the literal text </script> inside inline JavaScript. Use <\\/script> instead if needed.",
            "- Do not rewrite the full document/body/root structure or use hard reset strategies such as document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, or replaceWith.",
            "- Do not return a blank stage, near-solid black screen, or hidden content.",
            "",
            "Prepared context JSON:",
            json.dumps(context, indent=2),
        ]
    )


def extract_gemini_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return ""
    chunks: list[str] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content")
        if not isinstance(content, dict):
            continue
        parts = content.get("parts")
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                chunks.append(text.strip())
        if chunks:
            break
    return "\n".join(chunks).strip()


def extract_gemini_error(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if isinstance(error, dict):
        for key in ("message", "status"):
            value = error.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    prompt_feedback = payload.get("promptFeedback")
    if isinstance(prompt_feedback, dict):
        block_reason = prompt_feedback.get("blockReason")
        if isinstance(block_reason, str) and block_reason.strip():
            return block_reason.strip()
    return ""


def is_gemini_schema_state_overflow_error_detail(detail: Any) -> bool:
    normalized = str(detail or "").strip().lower()
    if not normalized:
        return False
    return (
        "too many states for serving" in normalized
        or "schema produces a constraint" in normalized
        or ("schema" in normalized and "too many states" in normalized)
    )


def extract_gemini_stop_reason(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return ""
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        value = candidate.get("finishReason") or candidate.get("finish_reason")
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return ""


def extract_anthropic_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    content = payload.get("content")
    if not isinstance(content, list):
        return ""
    chunks: list[str] = []
    for part in content:
        if not isinstance(part, dict):
            continue
        if part.get("type") != "text":
            continue
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            chunks.append(text.strip())
    return "\n".join(chunks).strip()


def extract_anthropic_error(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if not isinstance(error, dict):
        return ""
    for key in ("message", "type"):
        value = error.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def extract_anthropic_stop_reason(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    value = payload.get("stop_reason")
    return value.strip().lower() if isinstance(value, str) and value.strip() else ""


def normalize_anthropic_model_name(value: str | None) -> str:
    return (value or "").strip()


# Anthropic models from Opus 4.7 onward removed sampling params (temperature,
# top_p, top_k) and the enabled/budget_tokens thinking mode — sending any of them
# returns a 400. Older Claude models (Opus 4.6 and earlier, all Sonnet/Haiku 4.x)
# still accept temperature. This gate only applies to the Anthropic call; the
# Gemini path is unaffected.
ANTHROPIC_MODELS_WITHOUT_SAMPLING_PARAMS = ("opus-4-8", "opus-4-7")


def anthropic_model_accepts_sampling_params(model: str) -> bool:
    normalized = (model or "").strip().lower()
    return not any(
        marker in normalized for marker in ANTHROPIC_MODELS_WITHOUT_SAMPLING_PARAMS
    )


def resolve_anthropic_base_url() -> str:
    base_url = (settings.anthropic_base_url or "").strip() or ANTHROPIC_API_BASE
    return base_url.rstrip("/")


def resolve_anthropic_artifact_build_model() -> str:
    return (
        normalize_anthropic_model_name(settings.anthropic_artifact_build_model)
        or DEFAULT_ANTHROPIC_ARTIFACT_BUILD_MODEL
    )


def normalize_gemini_model_name(value: str | None) -> str:
    text = (value or "").strip()
    if text.startswith("models/"):
        return text[len("models/") :].strip()
    return text


# Patch / JSON artifact paths pass thinking_budget=0 to skip thinking on Flash. Gemini 3.x Pro
# returns 400: "Budget 0 is invalid. This model only works in thinking mode."
GEMINI_THINKING_ONLY_MODEL_MIN_BUDGET = 8192


def effective_gemini_thinking_budget(model: str, requested: int | None) -> int | None:
    """Map requested budget; upgrade 0 → minimum for thinking-only Gemini 3.x models."""
    if requested is None:
        return None
    if requested > 0:
        return requested
    name = (normalize_gemini_model_name(model) or "").lower()
    if "gemini-3" in name or "3.1" in name:
        return GEMINI_THINKING_ONLY_MODEL_MIN_BUDGET
    return 0


def resolve_gemini_base_url() -> str:
    base_url = (settings.gemini_base_url or "").strip() or GEMINI_API_BASE
    return base_url.rstrip("/")


def resolve_gemini_plan_model() -> str:
    return (
        normalize_gemini_model_name(settings.gemini_plan_model)
        or normalize_gemini_model_name(settings.gemini_model)
        or DEFAULT_GEMINI_PLAN_MODEL
    )


def resolve_gemini_artifact_edit_model() -> str:
    return (
        normalize_gemini_model_name(settings.gemini_artifact_edit_model)
        or normalize_gemini_model_name(settings.gemini_model)
        or DEFAULT_GEMINI_ARTIFACT_EDIT_MODEL
    )


def resolve_gemini_artifact_repair_model() -> str:
    return (
        normalize_gemini_model_name(settings.gemini_artifact_repair_model)
        or normalize_gemini_model_name(settings.gemini_artifact_edit_model)
        or normalize_gemini_model_name(settings.gemini_model)
        or DEFAULT_GEMINI_ARTIFACT_REPAIR_MODEL
    )


def resolve_gemini_artifact_answer_model() -> str:
    return (
        normalize_gemini_model_name(settings.gemini_artifact_answer_model)
        or normalize_gemini_model_name(settings.gemini_model)
        or DEFAULT_GEMINI_ARTIFACT_ANSWER_MODEL
    )


def build_gemini_generate_content_endpoint(base_url: str, model: str) -> str:
    normalized_model = normalize_gemini_model_name(model) or DEFAULT_GEMINI_MODEL
    return f"{base_url}/models/{normalized_model}:generateContent"


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


