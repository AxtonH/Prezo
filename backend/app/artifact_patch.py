from __future__ import annotations

import json
import re
from copy import deepcopy
from typing import Any

from .artifact_css_tree import set_css_property_in_css_tree
from .artifact_package import (
    ARTIFACT_PACKAGE_ENTRY_FILE,
    ARTIFACT_PACKAGE_RENDERER_FILE,
    ARTIFACT_PACKAGE_STYLES_FILE,
    build_segmented_artifact_package,
    get_artifact_package_file_content,
    materialize_artifact_html_from_package,
    upsert_artifact_package_file_content,
)

SUPPORTED_PATCH_EDIT_TYPES = {
    "set_css_property",
}

SUPPORTED_PATCH_TARGET_FILES = {
    ARTIFACT_PACKAGE_ENTRY_FILE,
    ARTIFACT_PACKAGE_STYLES_FILE,
    ARTIFACT_PACKAGE_RENDERER_FILE,
}
SUPPORTED_PATCH_TARGET_FILE_MAP = {
    target.lower(): target for target in SUPPORTED_PATCH_TARGET_FILES
}

DEFAULT_PATCH_TARGET_FILE_BY_EDIT_TYPE = {
    "set_css_property": ARTIFACT_PACKAGE_STYLES_FILE,
}


def normalize_artifact_patch_plan(raw_text: str) -> dict[str, Any]:
    parsed = _try_parse_json(raw_text)
    if parsed is None:
        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_text, re.IGNORECASE)
        if fenced and fenced.group(1):
            parsed = _try_parse_json(fenced.group(1))
    if parsed is None:
        object_slice = _extract_first_json_object(raw_text)
        if object_slice:
            parsed = _try_parse_json(object_slice)
    if not isinstance(parsed, dict):
        return {"assistantMessage": "", "edits": []}
    assistant_message = (
        parsed.get("assistantMessage")
        if isinstance(parsed.get("assistantMessage"), str)
        else parsed.get("message")
        if isinstance(parsed.get("message"), str)
        else ""
    )
    edits_raw = parsed.get("edits")
    edits = [item for item in edits_raw if isinstance(item, dict)] if isinstance(edits_raw, list) else []
    return {"assistantMessage": assistant_message.strip(), "edits": edits}


def apply_artifact_patch_plan_to_package(
    *,
    html: str,
    artifact_package: dict[str, Any] | None,
    plan: dict[str, Any],
) -> tuple[str, dict[str, Any] | None, list[str]]:
    segmented_package = build_segmented_artifact_package(html, artifact_package)
    if not segmented_package:
        return "", artifact_package, ["patch target html is empty."]

    original_html = materialize_artifact_html_from_package(
        segmented_package,
        fallback_html=html,
    ).strip()
    if not original_html:
        return "", artifact_package, ["patch target html is empty."]

    edits = plan.get("edits") if isinstance(plan.get("edits"), list) else []
    if not edits:
        return original_html, segmented_package, ["patch plan did not include any edits."]

    working_package = deepcopy(segmented_package)
    issues: list[str] = []
    any_change = False

    for index, raw_edit in enumerate(edits):
        if not isinstance(raw_edit, dict):
            issues.append(f"patch edit #{index + 1} is not an object.")
            break
        edit = dict(raw_edit)
        edit_type = (
            edit.get("type").strip().lower() if isinstance(edit.get("type"), str) else ""
        )
        if edit_type not in SUPPORTED_PATCH_EDIT_TYPES:
            issues.append(f"patch edit #{index + 1} used unsupported type `{edit_type}`.")
            break

        if edit_type == "set_css_property":
            selector = edit.get("selector")
            property_name = edit.get("property")
            value = edit.get("value")
            if not all(
                isinstance(item, str) and item.strip()
                for item in (selector, property_name, value)
            ):
                issues.append(f"patch edit #{index + 1} is missing selector/property/value.")
                break
            target_file = normalize_patch_target_file(edit.get("file"), edit_type=edit_type)
            if target_file != ARTIFACT_PACKAGE_STYLES_FILE:
                issues.append(
                    f"patch edit #{index + 1} set_css_property only supports `{ARTIFACT_PACKAGE_STYLES_FILE}`."
                )
                break
            css_text = get_artifact_package_file_content(working_package, target_file)
            updated_css, changed, status = set_css_property_in_css_tree(
                css_text,
                selector.strip(),
                property_name.strip(),
                value.strip(),
            )
            if status == "not_found":
                issues.append(
                    f"patch edit #{index + 1} could not apply CSS selector `{selector.strip()}` in `{target_file}`."
                )
                break
            if changed:
                working_package = upsert_artifact_package_file_content(
                    working_package,
                    path=target_file,
                    content=updated_css,
                    language="css",
                )
                any_change = True
            continue

    if issues:
        return original_html, segmented_package, issues

    patched_html = materialize_artifact_html_from_package(
        working_package,
        fallback_html=original_html,
    ).strip()
    if not any_change or not patched_html or patched_html == original_html:
        return original_html, segmented_package, ["patch plan did not change the artifact html."]

    return patched_html, working_package, []


def apply_artifact_patch_plan(
    html: str,
    plan: dict[str, Any],
) -> tuple[str, list[str]]:
    patched_html, _patched_package, issues = apply_artifact_patch_plan_to_package(
        html=html,
        artifact_package=None,
        plan=plan,
    )
    return patched_html, issues


def normalize_patch_target_file(raw_value: Any, *, edit_type: str) -> str:
    target = _as_text(raw_value).strip().replace("\\", "/")
    while target.startswith("./"):
        target = target[2:]
    mapped_target = SUPPORTED_PATCH_TARGET_FILE_MAP.get(target.lower())
    if mapped_target:
        return mapped_target
    return DEFAULT_PATCH_TARGET_FILE_BY_EDIT_TYPE.get(edit_type, ARTIFACT_PACKAGE_ENTRY_FILE)


def _as_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    return str(value)


def _try_parse_json(value: str) -> Any | None:
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _extract_first_json_object(raw_text: str) -> str:
    start = raw_text.find("{")
    while start >= 0:
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(raw_text)):
            char = raw_text[index]
            if in_string:
                if escaped:
                    escaped = False
                    continue
                if char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return raw_text[start : index + 1]
        start = raw_text.find("{", start + 1)
    return ""
