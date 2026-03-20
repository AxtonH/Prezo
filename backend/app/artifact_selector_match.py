"""Fuzzy CSS selector matching utilities.

When the LLM emits a selector that does not exist verbatim in the
artifact's CSS, these helpers try increasingly loose matching strategies
to find the *intended* real selector before giving up.

Matching layers (in order):
    1. Exact match  (already handled by the caller)
    2. Normalised match  – collapse whitespace & combinators
    3. Similarity match   – token-overlap + Levenshtein ratio
"""

from __future__ import annotations

import re
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclass(slots=True, frozen=True)
class SelectorMatchResult:
    """Result of a fuzzy selector lookup."""

    matched_selector: str
    """The real CSS selector that was matched, or empty string if none."""

    confidence: float
    """0.0 – 1.0 indicating match quality.  1.0 = exact / normalised hit."""

    strategy: str
    """Which matching layer produced the result:
    'exact', 'normalised', 'similarity', or 'none'."""


def find_best_selector_match(
    target: str,
    candidates: list[str],
    *,
    similarity_threshold: float = 0.55,
) -> SelectorMatchResult:
    """Try to match *target* against *candidates* using layered strategies.

    Parameters
    ----------
    target:
        The selector the LLM emitted (may be hallucinated).
    candidates:
        Real selectors extracted from the artifact CSS.
    similarity_threshold:
        Minimum similarity score (0–1) to accept a fuzzy match.
        Lower = more permissive.  0.55 is intentionally lenient so that
        common abbreviations like ``.bg`` → ``.background`` still match.

    Returns
    -------
    SelectorMatchResult with the best match (or empty / 'none').
    """
    if not target or not candidates:
        return SelectorMatchResult("", 0.0, "none")

    target_stripped = target.strip()

    # --- Layer 1: exact (case-insensitive) ---
    target_lower = target_stripped.lower()
    for candidate in candidates:
        if candidate.strip().lower() == target_lower:
            return SelectorMatchResult(candidate, 1.0, "exact")

    # --- Layer 2: normalised ---
    target_norm = _normalise_selector(target_stripped)
    for candidate in candidates:
        if _normalise_selector(candidate) == target_norm:
            return SelectorMatchResult(candidate, 1.0, "normalised")

    # --- Layer 3: similarity (token-overlap + Levenshtein) ---
    best_candidate = ""
    best_score = 0.0
    for candidate in candidates:
        score = _selector_similarity(target_stripped, candidate)
        if score > best_score:
            best_score = score
            best_candidate = candidate

    if best_score >= similarity_threshold and best_candidate:
        return SelectorMatchResult(best_candidate, best_score, "similarity")

    return SelectorMatchResult("", 0.0, "none")


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

_COMBINATOR_RE = re.compile(r"\s*([>+~])\s*")
_WHITESPACE_RE = re.compile(r"\s+")
_ATTR_WHITESPACE_RE = re.compile(r"\[\s+|\s+\]")


def _normalise_selector(selector: str) -> str:
    """Collapse a selector to a canonical form for comparison.

    * lower-cased
    * whitespace collapsed to single spaces
    * combinators normalised:  ``a > b``  →  ``a>b``
    * attribute brackets tightened: ``[ data-x ]`` → ``[data-x]``
    """
    s = selector.strip().lower()
    s = _COMBINATOR_RE.sub(r"\1", s)
    s = _WHITESPACE_RE.sub(" ", s)
    s = _ATTR_WHITESPACE_RE.sub(lambda m: m.group().replace(" ", ""), s)
    return s


# ---------------------------------------------------------------------------
# Similarity scoring
# ---------------------------------------------------------------------------

_TOKEN_SPLIT_RE = re.compile(r"[.#\[\]:>\+~\s,()=]+")


def _tokenise_selector(selector: str) -> set[str]:
    """Split a selector into meaningful tokens for overlap scoring.

    ``#race-track .bg-layer::before``  →  {``race``, ``track``, ``bg``, ``layer``, ``before``}
    """
    raw = _TOKEN_SPLIT_RE.split(selector.lower())
    tokens: set[str] = set()
    for part in raw:
        # further split on hyphens / underscores / camelCase boundaries
        for sub in re.split(r"[-_]", part):
            # split camelCase
            for word in re.sub(r"([a-z])([A-Z])", r"\1 \2", sub).split():
                word = word.strip()
                if word and len(word) > 1:
                    tokens.add(word)
    return tokens


def _token_overlap_score(a: str, b: str) -> float:
    """Jaccard-like overlap of selector tokens, 0–1."""
    tokens_a = _tokenise_selector(a)
    tokens_b = _tokenise_selector(b)
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union) if union else 0.0


def _levenshtein_ratio(a: str, b: str) -> float:
    """Levenshtein similarity ratio between two strings (0–1).

    Uses the classic DP algorithm — no external dependency needed.
    Operates on normalised selectors so whitespace differences don't dominate.
    """
    s1 = _normalise_selector(a)
    s2 = _normalise_selector(b)
    len1, len2 = len(s1), len(s2)
    if len1 == 0 and len2 == 0:
        return 1.0
    max_len = max(len1, len2)
    if max_len == 0:
        return 1.0

    # Single-row DP for space efficiency
    prev_row = list(range(len2 + 1))
    for i in range(1, len1 + 1):
        curr_row = [i] + [0] * len2
        for j in range(1, len2 + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            curr_row[j] = min(
                curr_row[j - 1] + 1,      # insertion
                prev_row[j] + 1,           # deletion
                prev_row[j - 1] + cost,    # substitution
            )
        prev_row = curr_row

    distance = prev_row[len2]
    return 1.0 - (distance / max_len)


def _selector_similarity(target: str, candidate: str) -> float:
    """Combined similarity score blending token overlap and edit distance.

    Weights are tuned so that:
    * Selectors sharing most semantic tokens score high even if syntax differs
      (e.g. ``.race-track-bg`` vs ``#race-track-background``)
    * Selectors that are textually close score high even if token split differs
      (e.g. ``.bgLayer`` vs ``.bg-layer``)
    """
    token_score = _token_overlap_score(target, candidate)
    edit_score = _levenshtein_ratio(target, candidate)
    return 0.6 * token_score + 0.4 * edit_score
