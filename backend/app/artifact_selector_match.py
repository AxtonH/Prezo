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


# ---------------------------------------------------------------------------
# Parent-selector correction
# ---------------------------------------------------------------------------

# CSS combinators that separate parent from child in a compound selector.
_DESCENDANT_SPLIT_RE = re.compile(r"\s+(?![^(]*\))")  # space not inside ()


@dataclass(slots=True, frozen=True)
class SelectorCorrectionResult:
    """Outcome of a parent-vs-child selector correction check."""

    corrected_selector: str
    """The selector to use (may be the original or the parent)."""

    was_corrected: bool
    """True if the selector was redirected to the parent."""

    reason: str
    """Human-readable explanation (for logging / debugging)."""


def correct_parent_child_selector(
    selector: str,
    css_property: str,
    user_request: str,
    selector_property_map: dict[str, list[tuple[str, str]]],
) -> SelectorCorrectionResult:
    """Detect when the LLM targeted a child selector but the user's intent
    refers to the parent element, and redirect accordingly.

    Parameters
    ----------
    selector:
        The CSS selector the LLM chose (e.g. ``.lego-brick .stud``).
    css_property:
        The CSS property being set (e.g. ``width``).
    user_request:
        The original user edit request text.
    selector_property_map:
        Mapping of selector → [(property, value), ...] from the current CSS.
        Used to check whether the parent selector owns the same property.

    Returns
    -------
    SelectorCorrectionResult indicating whether the selector was corrected.
    """
    if not selector or not user_request:
        return SelectorCorrectionResult(selector, False, "")

    # Only act on descendant/child selectors (those with spaces or >).
    parent, child_tail = _split_parent_child(selector)
    if not parent or not child_tail:
        # Not a compound selector — nothing to correct.
        return SelectorCorrectionResult(selector, False, "")

    # Check: does the parent selector exist in the CSS with the same property?
    parent_has_property = _selector_has_property(
        parent, css_property, selector_property_map
    )
    if not parent_has_property:
        # Parent doesn't own this property — the child target is likely correct.
        return SelectorCorrectionResult(selector, False, "")

    # Only redirect for properties the user actually requested.
    # If the user says "increase width" but the edit is for "height" or "top",
    # it's a supplementary adjustment the LLM chose — not something we should
    # redirect to the parent.
    if not _property_mentioned_in_request(css_property, user_request):
        return SelectorCorrectionResult(selector, False, "")

    # Score how well the user's request matches the parent vs the child.
    user_tokens = _tokenise_user_request(user_request)
    if not user_tokens:
        return SelectorCorrectionResult(selector, False, "")

    parent_score = _request_selector_affinity(user_tokens, parent)
    child_score = _request_selector_affinity(user_tokens, child_tail)

    # Adjust scores when the user explicitly negated words matching a
    # selector's tokens (e.g. "not the stud" should penalise `.stud`,
    # "not the brick" should penalise `.lego-brick`).
    negated_tokens = _extract_negated_tokens(user_request)
    if negated_tokens:
        parent_sel_tokens = _tokenise_selector(parent)
        if parent_sel_tokens:
            hits = sum(1 for t in parent_sel_tokens if t in negated_tokens)
            if hits:
                parent_score -= hits / len(parent_sel_tokens)

        child_sel_tokens = _tokenise_selector(child_tail)
        if child_sel_tokens:
            hits = sum(1 for t in child_sel_tokens if t in negated_tokens)
            if hits:
                child_score -= hits / len(child_sel_tokens)

    if parent_score > child_score:
        return SelectorCorrectionResult(
            parent,
            True,
            f"redirected from `{selector}` to parent `{parent}` "
            f"(parent affinity {parent_score:.2f} > child affinity {child_score:.2f})",
        )

    return SelectorCorrectionResult(selector, False, "")


# ---------------------------------------------------------------------------
# Internals for parent-selector correction
# ---------------------------------------------------------------------------

def _split_parent_child(selector: str) -> tuple[str, str]:
    """Split a compound selector into its parent and final child segment.

    Examples::

        ".lego-brick .stud"      → (".lego-brick", ".stud")
        ".lego-brick > .stud"    → (".lego-brick", ".stud")
        ".lego-brick"            → ("", "")   (not compound)
        "body .wrap .lego-brick .stud" → ("body .wrap .lego-brick", ".stud")
    """
    normalized = selector.strip()
    if not normalized:
        return ("", "")

    # Try splitting on " > " (child combinator) or plain space.
    # We want the LAST segment as the child, everything before as the parent.
    # Handle ">" combinator: normalise to space-separated first.
    working = re.sub(r"\s*>\s*", " > ", normalized)

    # Find the last top-level space (not inside brackets/parens).
    last_space = _find_last_top_level_space(working)
    if last_space < 0:
        return ("", "")

    parent = working[:last_space].rstrip(" >").strip()
    child_tail = working[last_space:].lstrip(" >").strip()

    if not parent or not child_tail:
        return ("", "")

    return (parent, child_tail)


def _find_last_top_level_space(selector: str) -> int:
    """Find the index of the last space that isn't inside () or []."""
    depth_paren = 0
    depth_bracket = 0
    last_space = -1

    for i, ch in enumerate(selector):
        if ch == "(":
            depth_paren += 1
        elif ch == ")" and depth_paren > 0:
            depth_paren -= 1
        elif ch == "[":
            depth_bracket += 1
        elif ch == "]" and depth_bracket > 0:
            depth_bracket -= 1
        elif ch == " " and depth_paren == 0 and depth_bracket == 0:
            last_space = i

    return last_space


def _selector_has_property(
    selector: str,
    css_property: str,
    prop_map: dict[str, list[tuple[str, str]]],
) -> bool:
    """Check if *selector* has *css_property* declared in the property map."""
    target_prop = css_property.strip().lower()
    # Try exact match first, then case-insensitive.
    declarations = prop_map.get(selector)
    if declarations is None:
        selector_lower = selector.lower()
        for key, value in prop_map.items():
            if key.lower() == selector_lower:
                declarations = value
                break
    if not declarations:
        return False
    return any(name.strip().lower() == target_prop for name, _value in declarations)


# Maps CSS property names to natural-language synonyms that users might use.
# Only properties where parent-child confusion is common need entries here.
_PROPERTY_SYNONYMS: dict[str, set[str]] = {
    "width": {"width", "wider", "wide", "narrow", "narrower", "thin", "thinner"},
    "height": {"height", "tall", "taller", "shorter", "short"},
    "min-width": {"width", "wider", "wide"},
    "max-width": {"width", "wider", "wide"},
    "min-height": {"height", "tall", "taller"},
    "max-height": {"height", "tall", "taller"},
    "font-size": {"font", "text", "size", "bigger", "smaller", "larger"},
    "padding": {"padding", "spacing", "space"},
    "margin": {"margin", "spacing", "space", "gap"},
    "gap": {"gap", "spacing", "space"},
    "border-radius": {"radius", "rounded", "round", "corner", "corners"},
    "opacity": {"opacity", "transparent", "transparency", "fade", "faded"},
    "transform": {"size", "scale", "bigger", "smaller", "larger", "grow", "shrink"},
    "scale": {"size", "scale", "bigger", "smaller", "larger", "grow", "shrink"},
}


def _property_mentioned_in_request(css_property: str, user_request: str) -> bool:
    """Check if the CSS property (or a natural-language synonym) appears in
    the user's request.  Returns True for generic sizing words like
    'bigger'/'increase'/'50%' which imply the primary sizing properties."""
    lowered = user_request.lower()
    prop_lower = css_property.strip().lower()

    # Direct mention of the property name (e.g. "width", "font-size").
    bare_prop = prop_lower.replace("-", " ").replace("_", " ")
    for word in bare_prop.split():
        if word and word in lowered:
            return True

    # Check synonyms.
    synonyms = _PROPERTY_SYNONYMS.get(prop_lower, set())
    for syn in synonyms:
        if syn in lowered:
            return True

    # Generic sizing intent covers width/height/transform/scale.
    if prop_lower in {"width", "height", "transform", "scale", "min-width",
                       "max-width", "min-height", "max-height", "font-size"}:
        if re.search(
            r"\b(?:increase|decrease|bigger|smaller|larger|grow|shrink|expand|reduce|enlarge|size|resize|50%|percent)\b",
            lowered,
        ):
            # Only match if the SPECIFIC property is also mentioned or this
            # is a primary dimension (width/height).
            if prop_lower in {"width", "height"}:
                return True

    return False


_USER_REQUEST_TOKEN_RE = re.compile(r"[a-zA-Z]+")
_NEGATION_WORDS = frozenset({"not", "no", "dont", "never", "without", "except"})


_USER_REQUEST_STOP_WORDS = frozenset({
    "the", "a", "an", "of", "by", "to", "in", "on", "and", "or", "it",
    "is", "be", "do", "at", "for", "with", "from", "as", "its", "make",
    "set", "css", "px", "rem", "em", "vh", "vw",
})


def _stem_token(word: str) -> str | None:
    """Return a basic stem of *word*, or ``None`` if no stemming applies."""
    if word.endswith("es") and len(word) > 3:
        return word[:-2]
    if word.endswith("s") and len(word) > 2:
        return word[:-1]
    if word.endswith("ed") and len(word) > 3:
        return word[:-2]
    return None


def _tokenise_user_request(text: str) -> set[str]:
    """Extract meaningful word tokens from a user's edit request.

    Applies basic stemming (strip trailing 's', 'es', 'ed') so that
    "bricks" matches "brick" and "increased" matches "increase".
    """
    raw_tokens = _USER_REQUEST_TOKEN_RE.findall(text.lower())
    tokens: set[str] = set()
    for word in raw_tokens:
        if len(word) < 2 or word in _USER_REQUEST_STOP_WORDS:
            continue
        tokens.add(word)
        stem = _stem_token(word)
        if stem:
            tokens.add(stem)
    return tokens


def _extract_negated_tokens(text: str) -> set[str]:
    """Identify tokens that follow negation words in *text*.

    Splits on clause boundaries (commas, semicolons, periods) first so that
    negation in one clause does not bleed into the next.  Within a clause,
    content words after a negation word are treated as negated.

    Example::

        "not the stud"                          → {"stud"}
        "not the stud, the actual brick"        → {"stud"}
        "increase, not studs"                   → {"stud", "studs"}
    """
    clauses = re.split(r"[,;.]+", text.lower())
    negated: set[str] = set()

    for clause in clauses:
        words = _USER_REQUEST_TOKEN_RE.findall(clause)
        seen_negation = False
        for word in words:
            if word in _NEGATION_WORDS:
                seen_negation = True
                continue
            if not seen_negation:
                continue
            if len(word) < 2 or word in _USER_REQUEST_STOP_WORDS:
                continue
            negated.add(word)
            stem = _stem_token(word)
            if stem:
                negated.add(stem)

    return negated


def _request_selector_affinity(
    user_tokens: set[str], selector: str
) -> float:
    """Score how well a user's request tokens match a CSS selector.

    Returns a 0–1 score: proportion of *selector* tokens that appear in
    *user_tokens*.  A higher score means the user is more likely referring
    to this selector.
    """
    selector_tokens = _tokenise_selector(selector)
    if not selector_tokens:
        return 0.0
    hits = sum(1 for t in selector_tokens if t in user_tokens)
    return hits / len(selector_tokens)
