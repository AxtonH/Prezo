"""Tests for `brand_context.build_brand_context`."""

from __future__ import annotations

from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.brand_context import (
    build_brand_context,
    build_brand_executive_summary_for_artifact,
    merge_brand_package_with_design_guidelines,
)


def test_semantic_mode_produces_css_and_mode() -> None:
    pkg = build_brand_context(
        brand_name="Acme",
        guidelines={
            "semantic": {
                "colors": {
                    "background": "#ffffff",
                    "accent": "#2563eb",
                },
                "fonts": {
                    "heading": {
                        "family": "DM Sans",
                        "google_font_slug": "DM+Sans:wght@400;700",
                    },
                    "body": {
                        "family": "Inter",
                        "google_font_slug": "Inter:wght@400;600",
                    },
                },
                "logo_url": "https://example.com/logo.png",
            }
        },
        raw_summary="",
    )
    assert pkg.mode == "semantic"
    assert "--brand-bg: #ffffff" in pkg.css_block
    assert "--brand-accent: #2563eb" in pkg.css_block
    assert "fonts.googleapis.com" in pkg.font_links_html
    assert "Acme" in pkg.llm_prompt
    assert pkg.logo_url == "https://example.com/logo.png"


def test_legacy_mode_bounded() -> None:
    long_tone = "x" * 5000
    pkg = build_brand_context(
        brand_name="Legacy",
        guidelines={
            "primary_colors": ["#111111 – main", "#222222"],
            "tone_of_voice": long_tone,
        },
        raw_summary="y" * 5000,
    )
    assert pkg.mode == "legacy"
    assert pkg.css_block == ""
    assert len(pkg.llm_prompt) <= 2600  # LEGACY_PROMPT_MAX + small header
    assert len(pkg.reference_excerpt) <= 3001


def test_merge_brand_package_appends_user_guidelines() -> None:
    pkg = build_brand_context(brand_name="Acme", guidelines={}, raw_summary="")
    merged = merge_brand_package_with_design_guidelines("Use large type", pkg)
    assert "--- User-provided guidelines ---" in merged
    assert "Use large type" in merged
    assert "Acme" in merged


def test_merge_trims_long_user_guidelines() -> None:
    pkg = build_brand_context(brand_name="Acme", guidelines={}, raw_summary="")
    merged = merge_brand_package_with_design_guidelines("x" * 3000, pkg)
    user_part = merged.split("--- User-provided guidelines ---")[-1].strip()
    assert len(user_part) <= 450  # USER_GUIDELINES_MERGE_MAX (ellipsis keeps total at limit)


def test_executive_summary_stays_bounded_for_heavy_legacy_profile() -> None:
    pkg = build_brand_context(
        brand_name="Heavy",
        guidelines={"tone_of_voice": "z" * 8000},
        raw_summary="r" * 5000,
    )
    summary = build_brand_executive_summary_for_artifact(pkg)
    assert len(summary) <= 900
    merged = merge_brand_package_with_design_guidelines("", pkg)
    assert len(merged) <= 900
