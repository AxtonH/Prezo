from __future__ import annotations

import json
import re
from copy import deepcopy
from typing import Any

ARTIFACT_PACKAGE_FORMAT = "prezo-artifact-package@1"
ARTIFACT_PACKAGE_ENTRY_FILE = "index.html"
ARTIFACT_PACKAGE_STYLES_FILE = "styles.css"
ARTIFACT_PACKAGE_RENDERER_FILE = "renderer.js"

_STYLE_TAG_RE = re.compile(r"<style\b[^>]*>(?P<body>[\s\S]*?)</style>", re.IGNORECASE)
_SCRIPT_TAG_RE = re.compile(
    r"<script\b(?P<attrs>[^>]*)>(?P<body>[\s\S]*?)</script>", re.IGNORECASE
)
_HEAD_CLOSE_RE = re.compile(r"</head\s*>", re.IGNORECASE)
_HEAD_OPEN_RE = re.compile(r"<head\b[^>]*>", re.IGNORECASE)
_BODY_CLOSE_RE = re.compile(r"</body\s*>", re.IGNORECASE)
_BODY_OPEN_RE = re.compile(r"<body\b[^>]*>", re.IGNORECASE)
_SCRIPT_SRC_ATTR_RE = re.compile(r"\bsrc\s*=", re.IGNORECASE)
_STYLE_LINK_RE = re.compile(
    r"<link\b[^>]*href\s*=\s*['\"](?:\./)?styles\.css['\"][^>]*>",
    re.IGNORECASE,
)
_RENDERER_SRC_RE = re.compile(
    r"<script\b[^>]*src\s*=\s*['\"](?:\./)?renderer\.js['\"][^>]*>\s*</script>",
    re.IGNORECASE,
)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def _normalize_file_language(path: str, language: str | None) -> str | None:
    normalized_language = _as_text(language).strip().lower()
    if normalized_language:
        return normalized_language
    lowered_path = path.strip().lower()
    if lowered_path.endswith(".html"):
        return "html"
    if lowered_path.endswith(".css"):
        return "css"
    if lowered_path.endswith(".js"):
        return "javascript"
    return None


def _is_html_package_file(file_data: dict[str, Any]) -> bool:
    language = _as_text(file_data.get("language")).strip().lower()
    if language == "html":
        return True
    path = _as_text(file_data.get("path")).strip().lower()
    return path.endswith(".html")


def _normalize_package_files(files: Any) -> list[dict[str, Any]]:
    if not isinstance(files, list):
        return []
    normalized: list[dict[str, Any]] = []
    for file_data in files:
        if not isinstance(file_data, dict):
            continue
        path = _as_text(file_data.get("path")).strip()
        if not path:
            continue
        content = _as_text(file_data.get("content"))
        language = _normalize_file_language(path, _as_text(file_data.get("language")))
        normalized.append(
            {
                "path": path,
                "content": content,
                "language": language,
            }
        )
    return normalized


def _insert_before_closing_tag(source: str, closing_re: re.Pattern[str], content: str) -> str:
    match = closing_re.search(source)
    if not match:
        return source
    return f"{source[:match.start()]}{content}\n{source[match.start():]}"


def _insert_after_opening_tag(source: str, opening_re: re.Pattern[str], content: str) -> str:
    match = opening_re.search(source)
    if not match:
        return source
    return f"{source[:match.end()]}\n{content}{source[match.end():]}"


def _replace_first_or_remove_rest(
    source: str, pattern: re.Pattern[str], replacement: str
) -> tuple[str, bool]:
    seen = False

    def _replace(match: re.Match[str]) -> str:
        nonlocal seen
        if seen:
            return ""
        seen = True
        return replacement

    return pattern.sub(_replace, source), seen


def _extract_entry_html_from_package(artifact_package: dict[str, Any]) -> str:
    files = _normalize_package_files(artifact_package.get("files"))
    if not files:
        return ""
    entry = _as_text(artifact_package.get("entry")).strip() or ARTIFACT_PACKAGE_ENTRY_FILE
    entry_file = next(
        (
            file_data
            for file_data in files
            if _as_text(file_data.get("path")).strip() == entry
            and _is_html_package_file(file_data)
        ),
        None,
    )
    if isinstance(entry_file, dict):
        entry_html = _as_text(entry_file.get("content")).strip()
        if entry_html:
            return entry_html
    fallback_html = next((file_data for file_data in files if _is_html_package_file(file_data)), None)
    if isinstance(fallback_html, dict):
        return _as_text(fallback_html.get("content")).strip()
    return ""


def sanitize_artifact_package(
    artifact_package: dict[str, Any] | None,
    *,
    fallback_html: str = "",
) -> dict[str, Any] | None:
    files = _normalize_package_files(artifact_package.get("files")) if isinstance(artifact_package, dict) else []
    if not files:
        fallback = _as_text(fallback_html).strip()
        if not fallback:
            return None
        return build_single_file_artifact_package(fallback)
    format_value = (
        _as_text(artifact_package.get("format")).strip()
        if isinstance(artifact_package, dict)
        else ""
    )
    entry = (
        _as_text(artifact_package.get("entry")).strip()
        if isinstance(artifact_package, dict)
        else ""
    )
    if not entry:
        entry = files[0]["path"]
    if not any(_as_text(file_data.get("path")).strip() == entry for file_data in files):
        entry = files[0]["path"]
    return {
        "format": format_value or ARTIFACT_PACKAGE_FORMAT,
        "entry": entry,
        "files": files,
    }


def build_single_file_artifact_package(html: str) -> dict[str, Any] | None:
    normalized = _as_text(html).strip()
    if not normalized:
        return None
    return {
        "format": ARTIFACT_PACKAGE_FORMAT,
        "entry": ARTIFACT_PACKAGE_ENTRY_FILE,
        "files": [
            {
                "path": ARTIFACT_PACKAGE_ENTRY_FILE,
                "content": normalized,
                "language": "html",
            }
        ],
    }


def get_artifact_package_file_content(
    artifact_package: dict[str, Any] | None,
    path: str,
) -> str:
    if not isinstance(artifact_package, dict):
        return ""
    target = _as_text(path).strip()
    if not target:
        return ""
    files = _normalize_package_files(artifact_package.get("files"))
    match = next(
        (
            file_data
            for file_data in files
            if _as_text(file_data.get("path")).strip().lower() == target.lower()
        ),
        None,
    )
    if not isinstance(match, dict):
        return ""
    return _as_text(match.get("content"))


def upsert_artifact_package_file_content(
    artifact_package: dict[str, Any] | None,
    *,
    path: str,
    content: str,
    language: str | None = None,
) -> dict[str, Any]:
    target = _as_text(path).strip()
    if not target:
        raise ValueError("path is required")
    package = sanitize_artifact_package(artifact_package) or {
        "format": ARTIFACT_PACKAGE_FORMAT,
        "entry": ARTIFACT_PACKAGE_ENTRY_FILE,
        "files": [],
    }
    files = deepcopy(package["files"])
    language_value = _normalize_file_language(target, language)
    updated = False
    for file_data in files:
        if _as_text(file_data.get("path")).strip().lower() != target.lower():
            continue
        file_data["content"] = _as_text(content)
        file_data["language"] = language_value
        updated = True
        break
    if not updated:
        files.append(
            {
                "path": target,
                "content": _as_text(content),
                "language": language_value,
            }
        )
    package["files"] = files
    return package


def build_segmented_artifact_package(
    html: str,
    artifact_package: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    sanitized = sanitize_artifact_package(artifact_package, fallback_html=html)
    source_html = ""
    if sanitized:
        source_html = materialize_artifact_html_from_package(sanitized, fallback_html=html)
    else:
        source_html = _as_text(html).strip()
    if not source_html:
        return None

    styles: list[str] = []
    scripts: list[str] = []

    def _style_replace(match: re.Match[str]) -> str:
        body = _as_text(match.group("body")).strip()
        if body:
            styles.append(body)
        if len(styles) == 1:
            return (
                '<link rel="stylesheet" href="./styles.css" '
                'data-prezo-artifact-package="styles" />'
            )
        return ""

    index_html = _STYLE_TAG_RE.sub(_style_replace, source_html)

    def _script_replace(match: re.Match[str]) -> str:
        attrs = _as_text(match.group("attrs"))
        if _SCRIPT_SRC_ATTR_RE.search(attrs):
            return match.group(0)
        body = _as_text(match.group("body")).strip()
        if body:
            scripts.append(body)
        if len(scripts) == 1:
            return (
                '<script src="./renderer.js" '
                'data-prezo-artifact-package="renderer"></script>'
            )
        return ""

    index_html = _SCRIPT_TAG_RE.sub(_script_replace, index_html)

    if not _STYLE_LINK_RE.search(index_html):
        style_link = (
            '<link rel="stylesheet" href="./styles.css" '
            'data-prezo-artifact-package="styles" />'
        )
        updated = _insert_before_closing_tag(index_html, _HEAD_CLOSE_RE, style_link)
        if updated == index_html:
            updated = _insert_after_opening_tag(index_html, _HEAD_OPEN_RE, style_link)
        if updated == index_html:
            updated = _insert_after_opening_tag(index_html, _BODY_OPEN_RE, style_link)
        if updated == index_html:
            updated = f"{style_link}\n{index_html}"
        index_html = updated

    if not _RENDERER_SRC_RE.search(index_html):
        renderer_script = (
            '<script src="./renderer.js" '
            'data-prezo-artifact-package="renderer"></script>'
        )
        updated = _insert_before_closing_tag(index_html, _BODY_CLOSE_RE, renderer_script)
        if updated == index_html:
            updated = f"{index_html}\n{renderer_script}"
        index_html = updated

    existing_styles = (
        get_artifact_package_file_content(sanitized, ARTIFACT_PACKAGE_STYLES_FILE)
        if sanitized
        else ""
    )
    existing_renderer = (
        get_artifact_package_file_content(sanitized, ARTIFACT_PACKAGE_RENDERER_FILE)
        if sanitized
        else ""
    )
    styles_content = "\n\n".join(item for item in styles if item).strip() or existing_styles
    renderer_content = "\n\n".join(item for item in scripts if item).strip() or existing_renderer

    package = {
        "format": ARTIFACT_PACKAGE_FORMAT,
        "entry": ARTIFACT_PACKAGE_ENTRY_FILE,
        "files": [
            {
                "path": ARTIFACT_PACKAGE_ENTRY_FILE,
                "content": index_html.strip(),
                "language": "html",
            },
            {
                "path": ARTIFACT_PACKAGE_STYLES_FILE,
                "content": styles_content,
                "language": "css",
            },
            {
                "path": ARTIFACT_PACKAGE_RENDERER_FILE,
                "content": renderer_content,
                "language": "javascript",
            },
        ],
    }

    if sanitized:
        core_paths = {
            ARTIFACT_PACKAGE_ENTRY_FILE.lower(),
            ARTIFACT_PACKAGE_STYLES_FILE.lower(),
            ARTIFACT_PACKAGE_RENDERER_FILE.lower(),
        }
        extras = [
            deepcopy(file_data)
            for file_data in _normalize_package_files(sanitized.get("files"))
            if _as_text(file_data.get("path")).strip().lower() not in core_paths
        ]
        if extras:
            package["files"].extend(extras)
    return package


def materialize_artifact_html_from_package(
    artifact_package: dict[str, Any] | None,
    *,
    fallback_html: str = "",
) -> str:
    sanitized = sanitize_artifact_package(artifact_package)
    if not sanitized:
        return _as_text(fallback_html).strip()

    entry_html = _extract_entry_html_from_package(sanitized)
    if not entry_html:
        return _as_text(fallback_html).strip()

    styles_content = get_artifact_package_file_content(
        sanitized, ARTIFACT_PACKAGE_STYLES_FILE
    ).strip()
    renderer_content = get_artifact_package_file_content(
        sanitized, ARTIFACT_PACKAGE_RENDERER_FILE
    ).strip()

    materialized = entry_html
    if styles_content:
        style_tag = f"<style>\n{styles_content}\n</style>"
        materialized, replaced = _replace_first_or_remove_rest(
            materialized, _STYLE_LINK_RE, style_tag
        )
        if not replaced:
            updated = _insert_before_closing_tag(materialized, _HEAD_CLOSE_RE, style_tag)
            if updated == materialized:
                updated = _insert_after_opening_tag(materialized, _HEAD_OPEN_RE, style_tag)
            if updated == materialized:
                updated = _insert_after_opening_tag(materialized, _BODY_OPEN_RE, style_tag)
            if updated == materialized:
                updated = f"{style_tag}\n{materialized}"
            materialized = updated

    if renderer_content:
        script_tag = f"<script>\n{renderer_content}\n</script>"
        materialized, replaced = _replace_first_or_remove_rest(
            materialized, _RENDERER_SRC_RE, script_tag
        )
        if not replaced:
            updated = _insert_before_closing_tag(materialized, _BODY_CLOSE_RE, script_tag)
            if updated == materialized:
                updated = f"{materialized}\n{script_tag}"
            materialized = updated

    return materialized.strip()


def extract_artifact_html_from_package(
    artifact_package: dict[str, Any] | None,
) -> str:
    return materialize_artifact_html_from_package(artifact_package)


def resolve_saved_artifact_html(
    html: str,
    artifact_package: dict[str, Any] | None,
) -> str:
    normalized_html = _as_text(html).strip()
    if normalized_html:
        return normalized_html
    return materialize_artifact_html_from_package(artifact_package)


def build_saved_artifact_snapshot_signature(
    *,
    html: str,
    artifact_package: dict[str, Any] | None,
    last_prompt: str | None,
    last_answers: dict[str, Any],
    theme_snapshot: dict[str, Any] | None,
) -> str:
    payload = {
        "html": html,
        "artifact_package": artifact_package,
        "last_prompt": last_prompt,
        "last_answers": last_answers,
        "theme_snapshot": theme_snapshot,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
