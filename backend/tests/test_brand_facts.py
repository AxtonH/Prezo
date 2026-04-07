"""Tests for `brand_facts.build_brand_facts`."""

from __future__ import annotations

from app.brand_facts import build_brand_facts


def test_build_includes_colors_typography_logo() -> None:
    guidelines = {
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
                "heading_1": {"family": "Fraunces", "source": "google"},
                "heading_2": {"family": "Fraunces"},
                "body": {"family": "Inter"},
            },
            "logo": {"url": "https://example.com/logo.png", "source": "upload"},
        },
    }
    facts = build_brand_facts(guidelines)
    assert len(facts["colors"]) == 2
    assert facts["colors"][0]["hex"] == "#111111"
    assert facts["colors"][0]["role"] == "Background"
    assert facts["typography"]["heading_1"]["family"] == "Fraunces"
    assert facts["typography"]["heading_1"]["source"] == "google"
    assert facts["logo"]["url"] == "https://example.com/logo.png"
    assert facts["logo"]["source"] == "upload"


def test_fallback_primary_colors_when_no_ui_roles() -> None:
    g = {"primary_colors": ["#2B1B4C — Navy"]}
    facts = build_brand_facts(g)
    assert len(facts["colors"]) == 1
    assert facts["colors"][0]["hex"] == "#2B1B4C"
    assert facts["colors"][0]["role"] == "Swatch 1"
    assert "label" in facts["colors"][0]


def test_empty_guidelines() -> None:
    facts = build_brand_facts({})
    assert facts["colors"] == []
    assert facts["logo"] is None
    assert "typography" not in facts
