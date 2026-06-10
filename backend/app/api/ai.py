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

from ..ai_prompts import (  # noqa: F401  (re-exported for tests/backcompat)
    POLL_GAME_ARTIFACT_ASSISTANT_SYSTEM_INSTRUCTION,
    POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_JSON_SCHEMA,
    POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_SYSTEM_INSTRUCTION,
    POLL_GAME_ARTIFACT_PATCH_JSON_SCHEMA,
    POLL_GAME_ARTIFACT_PATCH_SYSTEM_INSTRUCTION,
    POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
    POLL_GAME_SYSTEM_INSTRUCTION,
)
from ..ai_providers import (  # noqa: F401  (re-exported for tests/backcompat)
    ANTHROPIC_API_BASE,
    ANTHROPIC_ARTIFACT_MAX_TOKENS,
    ANTHROPIC_MODELS_WITHOUT_SAMPLING_PARAMS,
    ANTHROPIC_VERSION,
    DEFAULT_ANTHROPIC_ARTIFACT_BUILD_MODEL,
    DEFAULT_GEMINI_ARTIFACT_ANSWER_MODEL,
    DEFAULT_GEMINI_ARTIFACT_EDIT_MODEL,
    DEFAULT_GEMINI_ARTIFACT_REPAIR_MODEL,
    DEFAULT_GEMINI_MODEL,
    DEFAULT_GEMINI_PLAN_MODEL,
    GEMINI_API_BASE,
    GEMINI_ARTIFACT_BACKGROUND_TREATMENT_MAX_TOKENS,
    GEMINI_ARTIFACT_MAX_TOKENS,
    GEMINI_ARTIFACT_PATCH_MAX_TOKENS,
    GEMINI_ARTIFACT_RECOVERY_MAX_TOKENS,
    GEMINI_ARTIFACT_REPAIR_MAX_TOKENS,
    GEMINI_THINKING_ONLY_MODEL_MIN_BUDGET,
    anthropic_model_accepts_sampling_params,
    build_gemini_generate_content_endpoint,
    build_provider_request_error_detail,
    build_provider_timeout_detail,
    effective_gemini_thinking_budget,
    extract_anthropic_error,
    extract_anthropic_stop_reason,
    extract_anthropic_text,
    extract_gemini_error,
    extract_gemini_stop_reason,
    extract_gemini_text,
    is_gemini_schema_state_overflow_error_detail,
    normalize_anthropic_model_name,
    normalize_gemini_model_name,
    request_anthropic_text,
    request_gemini_text,
    resolve_anthropic_artifact_build_model,
    resolve_anthropic_base_url,
    resolve_gemini_artifact_answer_model,
    resolve_gemini_artifact_edit_model,
    resolve_gemini_artifact_repair_model,
    resolve_gemini_base_url,
    resolve_gemini_plan_model,
)
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
from ..artifact_builtin_patches import (  # noqa: F401  (re-exported for tests/backcompat)
    attempt_builtin_cityscape_background_patch,
    attempt_builtin_layout_orientation_patch,
    attempt_builtin_title_overlap_spacing_patch,
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
ARTIFACT_MIN_INITIAL_CALL_TIMEOUT_SECONDS = 45.0
ARTIFACT_MIN_FOLLOWUP_CALL_TIMEOUT_SECONDS = 45.0
ARTIFACT_PATCH_MIN_CALL_TIMEOUT_SECONDS = 20.0
ARTIFACT_PATCH_TIMEOUT_SECONDS = 60.0
ARTIFACT_PATCH_FALLBACK_RESERVE_SECONDS = 120.0


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


