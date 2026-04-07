"""Tests for `prompt_brand_guidelines.build_prompt_brand_guidelines`."""

from __future__ import annotations

from app.prompt_brand_guidelines import build_prompt_brand_guidelines


def test_build_includes_colors_typography_tone_visual_logo() -> None:
    guidelines = {
        "tone_of_voice": "Friendly and clear.",
        "ui_identity": {
            "color_roles": [
                {
                    "role": "Background",
                    "hex": "#111111",
                    "hierarchy_rank": 1,
                    "usage": "Slides",
                    "surface": "background",
                },
                {
                    "role": "Accent",
                    "hex": "#FF0000",
                    "hierarchy_rank": 2,
                    "usage": "CTAs",
                    "surface": "accent",
                },
            ],
            "typography": {
                "heading_1": {"family": "Fraunces"},
                "heading_2": {"family": "Fraunces"},
                "body": {"family": "Inter"},
            },
            "tone_calibration": {
                "serious_playful": 20,
                "formal_casual": 80,
                "respectful_irreverent": 50,
                "matter_of_fact_enthusiastic": 50,
            },
            "visual_style": {
                "visual_mood_aesthetic": "Warm editorial",
                "style_guidelines": "Use generous margins.",
                "design_elements": {
                    "patterns_textures": "",
                    "icon_style": "Line icons",
                    "image_treatment": "",
                    "decorative_elements": "",
                },
            },
            "logo": {"url": "https://example.com/logo.png", "source": "upload"},
        },
    }
    text = build_prompt_brand_guidelines(guidelines)
    assert "## Brand colors (hierarchy)" in text
    assert "#111111" in text and "Hierarchy 1" in text
    assert "## Typography" in text and "Fraunces" in text and "Inter" in text
    assert "## Tone" in text and "leans serious" in text
    assert "## Visual style" in text and "Warm editorial" in text
    assert "## Logo" in text and "https://example.com/logo.png" in text
    assert "Additional voice context" in text


def test_fallback_primary_colors_when_no_ui_roles() -> None:
    g = {"primary_colors": ["#2B1B4C — Navy"]}
    text = build_prompt_brand_guidelines(g)
    assert "Swatch 1" in text
    assert "#2B1B4C" in text
