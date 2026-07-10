/**
 * Artifact override reconciliation for the gamified station: when an AI edit
 * rewrites the artifact HTML, decide which manual overrides (text styling,
 * drags, resizes) must yield because the AI intentionally changed the same
 * element — and which survive. Detection compares element signatures,
 * inline positioning/sizing intent, parent layout, and <style>-rule diffs
 * between the prior and new HTML. Conservative on uncertainty: an override
 * we can't locate in BOTH documents is kept.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 9). Parses HTML with the
 * browser DOMParser; `el` is injected for the runtime-rendered-selector
 * synthesis (elements the artifact renders at runtime exist in neither
 * document).
 */
import { asText, extractPlainTextFromHtml, normalizeWhitespace } from './poll-game-gamified-utils.js'

export function createOverrideDiff(deps) {
  const { state, el, getPendingStyleOverrides } = deps

  /**
   * Drop question / option-label override entries whose embedded plain text no longer
   * matches the live poll (same rules everywhere we merge or persist overrides).
   *
   * @param {Record<string, unknown>} store
   * @param {object | null | undefined} poll
   */
  function pruneStalePollStyleOverridesInStore(store, poll) {
    if (!poll || typeof poll !== 'object') {
      return
    }
    if (!store || typeof store !== 'object') {
      return
    }
    const expectedQuestion = normalizeWhitespace(asText(poll.question)).toLowerCase()
    const options = Array.isArray(poll.options) ? poll.options : []
    const optionById = new Map(
      options.map((opt) => [asText(opt?.id), opt]).filter(([id]) => Boolean(id))
    )

    const qHtml = store.question
    if (typeof qHtml === 'string' && qHtml.trim()) {
      const got = normalizeWhitespace(extractPlainTextFromHtml(qHtml)).toLowerCase()
      if (got !== expectedQuestion) {
        delete store.question
      }
    }
    for (const key of Object.keys(store)) {
      if (!key.startsWith('option-label:')) {
        continue
      }
      const optionId = key.slice('option-label:'.length)
      const opt = optionById.get(optionId)
      const html = store[key]
      if (typeof html !== 'string' || !html.trim()) {
        continue
      }
      if (!opt) {
        delete store[key]
        continue
      }
      const got = normalizeWhitespace(extractPlainTextFromHtml(html)).toLowerCase()
      const want = normalizeWhitespace(asText(opt.label)).toLowerCase()
      if (got !== want) {
        delete store[key]
      }
    }
  }

  /**
   * Drop overrides whose underlying element the AI just changed.
   *
   * Context: the user can manually edit text (color it red), drag elements,
   * and otherwise produce overrides that live in style_overrides. We
   * preserve those overrides through AI edits so a drag survives a styling
   * tweak. But when the AI INTENTIONALLY changes the same thing the
   * override was about (user asks 'make the title blue' after coloring it
   * red manually), the override should yield to the AI's new value.
   *
   * Detection: for each override key, locate the corresponding element in
   * both the prior HTML (what the artifact looked like before this AI
   * edit) and the new HTML (the AI's output). If the element's stable
   * signature differs between the two, the AI changed it â€” drop the
   * override. Conservative on uncertainty: an override we can't locate
   * in BOTH HTMLs is kept (preserves drags on decorative children, etc).
   *
   * Only the question / option-label / option-* / position override kinds
   * have a reliable locator in arbitrary AI HTML. Copy and generic text
   * overrides depend on stable DOM-path ids that don't survive AI
   * restructures â€” those are pruned elsewhere (pruneStalePollStyleOverridesInStore).
   *
   * @param {Record<string, unknown>} store
   * @param {string} priorHtml
   * @param {string} newHtml
   */
  function dropOverridesAiChanged(store, priorHtml, newHtml) {
    if (!store || typeof store !== 'object') return
    const prior = asText(priorHtml)
    const next = asText(newHtml)
    if (!prior || !next || prior === next) return
    let priorDoc, nextDoc
    try {
      const parser = new DOMParser()
      priorDoc = parser.parseFromString(prior, 'text/html')
      nextDoc = parser.parseFromString(next, 'text/html')
    } catch {
      return
    }
    if (!priorDoc || !nextDoc) return

    for (const key of Object.keys(store)) {
      if (key === 'question') {
        const target = locateQuestionInDoc(priorDoc)
        const aiTarget = locateQuestionInDoc(nextDoc)
        if (target && aiTarget && signaturesDiffer(target, aiTarget)) {
          delete store[key]
        }
        continue
      }
      if (key.startsWith('option-label:')) {
        const optionId = key.slice('option-label:'.length)
        const target = locateOptionLabelInDoc(priorDoc, optionId)
        const aiTarget = locateOptionLabelInDoc(nextDoc, optionId)
        if (target && aiTarget && signaturesDiffer(target, aiTarget)) {
          delete store[key]
        }
        continue
      }
      if (
        key.startsWith('option-votes:') ||
        key.startsWith('option-percentage:') ||
        key.startsWith('option-rank:')
      ) {
        // Stat fields: the renderer rewrites their text every vote, so the
        // diff signal we care about is whether the AI changed the
        // ENCLOSING option row's structure. If the row itself changed,
        // the stat field's prior styling is no longer meaningful.
        const colonIdx = key.indexOf(':')
        const optionId = key.slice(colonIdx + 1)
        const target = locateOptionRowInDoc(priorDoc, optionId)
        const aiTarget = locateOptionRowInDoc(nextDoc, optionId)
        if (target && aiTarget && signaturesDiffer(target, aiTarget)) {
          delete store[key]
        }
        continue
      }
      if (key.startsWith('__prezo_pos:')) {
        // Position overrides need careful handling because AI edits can
        // affect different elements than the user dragged:
        //   - User drags element A, asks AI to change A's position â†’ AI
        //     moves A. We need to DROP A's override so the bridge doesn't
        //     re-apply the old drag on top of the AI's new position.
        //   - User drags element A, asks AI to change B â†’ AI rewrites the
        //     whole artifact and may strip A's inline transform as a
        //     side-effect. We need to KEEP A's override so the bridge
        //     re-applies the drag on render. A's position is preserved.
        //
        // Detection: drop ONLY when the AI explicitly took control of
        // THIS element's position. Signals:
        //   - element has its own inline `transform:` in the AI's HTML
        //   - element has its own inline absolute/fixed positioning
        //   - element's parent layout changed meaningfully (parent class,
        //     parent inline style, sibling index)
        // Otherwise keep the override â€” the AI didn't move this element,
        // it just rewrote unrelated parts of the artifact.
        const stableId = key.slice('__prezo_pos:'.length)
        const parsed = safeParseJSON(store[key])
        const role = parsed && typeof parsed.role === 'string' ? parsed.role : ''
        const optionId = parsed && typeof parsed.optionId === 'string' ? parsed.optionId : ''
        const label = parsed && typeof parsed.label === 'string' ? parsed.label : ''
        const anchor = parsed && typeof parsed.anchor === 'string' ? parsed.anchor : ''
        const target = locatePositionTarget(priorDoc, stableId, role, optionId, label, anchor)
        const aiTarget = locatePositionTarget(nextDoc, stableId, role, optionId, label, anchor)
        // Diagnostic logging â€” remove once override-after-AI is verified
        // stable. Helps explain why a particular position override was
        // dropped on the user's machine.
        const diag = {
          key, role, optionId,
          priorFound: !!target,
          nextFound: !!aiTarget,
          aiInlineStyle: aiTarget ? (aiTarget.getAttribute('style') || '') : '',
          priorParentStyle: target && target.parentElement ? (target.parentElement.getAttribute('style') || '') : '',
          nextParentStyle: aiTarget && aiTarget.parentElement ? (aiTarget.parentElement.getAttribute('style') || '') : '',
          priorParentId: target && target.parentElement ? (target.parentElement.id || '') : '',
          nextParentId: aiTarget && aiTarget.parentElement ? (aiTarget.parentElement.id || '') : ''
        }
        // Diagnostic: stash every decision into window.__prezoDebug for
        // inspection. Remove once the override-after-AI behavior is stable.
        const recordDecision = (verdict, reason) => {
          try {
            window.__prezoDebug = window.__prezoDebug || {}
            window.__prezoDebug.overrideDecisions = window.__prezoDebug.overrideDecisions || []
            window.__prezoDebug.overrideDecisions.push({
              ts: Date.now(), verdict, reason, ...diag
            })
            console.log(`[prezo-position-override] ${verdict} (${reason})`, diag)
          } catch (e) {}
        }
        // Runtime-rendered case: the element is created by the artifact's
        // renderer at runtime (e.g. option rows built from poll data via
        // JS in <script>), so it doesn't appear in the parsed static HTML
        // on either side. We can still detect AI moves that ride on
        // stylesheet rules â€” the AI typically adds/edits a rule that
        // targets the row's container or class selector (e.g.
        // `.tower-col:nth-child(1) { order: 99 }`) and those rules ARE
        // present in the parsed <style>.
        if (!target && !aiTarget) {
          const runtimeSelectors = runtimeRenderedSelectors(priorDoc, nextDoc, role)
          if (runtimeSelectors.length) {
            const priorRules = extractLayoutRulesForSelectors(priorDoc, runtimeSelectors)
            const nextRules = extractLayoutRulesForSelectors(nextDoc, runtimeSelectors)
            if (priorRules !== nextRules) {
              recordDecision('DROP', 'stylesheet rules changed (runtime-rendered)')
              delete store[key]
              continue
            }
          }
          recordDecision('KEEP', 'runtime-rendered (not in static HTML)')
          continue
        }
        if (!aiTarget) {
          // Element existed in prior static HTML but the AI removed it.
          recordDecision('DROP', 'element removed by AI')
          delete store[key]
          continue
        }
        if (hasExplicitPositioning(aiTarget)) {
          recordDecision('DROP', 'AI explicit positioning')
          delete store[key]
          continue
        }
        if (target && parentLayoutChanged(target, aiTarget)) {
          recordDecision('DROP', 'parent layout changed')
          delete store[key]
          continue
        }
        // Detect AI moves made via CSS rules in <style> rather than inline
        // styles. The AI often rewrites a stylesheet rule like
        // `#poll-question { position: absolute; top: 0; right: 0 }` while
        // leaving the element's tag/class/inline-style unchanged. Without
        // this check, signaturesDiffer + parentLayoutChanged both miss it.
        if (target && stylesheetRulesChangedForElement(priorDoc, nextDoc, target, aiTarget)) {
          recordDecision('DROP', 'stylesheet rules changed for this element')
          delete store[key]
          continue
        }
        recordDecision('KEEP', 'AI did not move this element')
        // Keep override â€” bridge will re-apply on render.
        continue
      }
      if (key.startsWith('__prezo_size:')) {
        // Symmetric to the position branch above. Drop only when the AI
        // explicitly took control of THIS element's size (inline width/
        // height/transform:scale, or a stylesheet rule that touches any
        // of the size-affecting properties on this element's selectors).
        // Otherwise keep â€” the user's manual resize survives an AI edit
        // that targeted a different element.
        const stableId = key.slice('__prezo_size:'.length)
        const parsed = safeParseJSON(store[key])
        const role = parsed && typeof parsed.role === 'string' ? parsed.role : ''
        const optionId = parsed && typeof parsed.optionId === 'string' ? parsed.optionId : ''
        const label = parsed && typeof parsed.label === 'string' ? parsed.label : ''
        const anchor = parsed && typeof parsed.anchor === 'string' ? parsed.anchor : ''
        const target = locatePositionTarget(priorDoc, stableId, role, optionId, label, anchor)
        const aiTarget = locatePositionTarget(nextDoc, stableId, role, optionId, label, anchor)
        const recordSizeDecision = (verdict, reason) => {
          try {
            window.__prezoDebug = window.__prezoDebug || {}
            window.__prezoDebug.overrideDecisions = window.__prezoDebug.overrideDecisions || []
            window.__prezoDebug.overrideDecisions.push({
              ts: Date.now(), verdict, reason, key, role, optionId,
              priorFound: !!target, nextFound: !!aiTarget,
              aiInlineStyle: aiTarget ? (aiTarget.getAttribute('style') || '') : ''
            })
            console.log(`[prezo-size-override] ${verdict} (${reason})`, { key, role })
          } catch (e) {}
        }
        if (!target && !aiTarget) {
          // Runtime-rendered or otherwise untraceable in static HTML.
          // Without a target to diff, the safe default is KEEP so user
          // intent survives. The bridge's re-match fallback (label,
          // anchor) handles re-attaching at render time.
          const runtimeSelectors = runtimeRenderedSelectors(priorDoc, nextDoc, role)
          if (runtimeSelectors.length) {
            const priorRules = extractSizeRulesForSelectors(priorDoc, runtimeSelectors)
            const nextRules = extractSizeRulesForSelectors(nextDoc, runtimeSelectors)
            if (priorRules !== nextRules) {
              recordSizeDecision('DROP', 'stylesheet size rules changed (runtime-rendered)')
              delete store[key]
              continue
            }
          }
          recordSizeDecision('KEEP', 'runtime-rendered (not in static HTML)')
          continue
        }
        if (!aiTarget) {
          recordSizeDecision('DROP', 'element removed by AI')
          delete store[key]
          continue
        }
        if (hasExplicitSizing(aiTarget)) {
          recordSizeDecision('DROP', 'AI explicit sizing')
          delete store[key]
          continue
        }
        if (target && stylesheetSizeRulesChangedForElement(priorDoc, nextDoc, target, aiTarget)) {
          recordSizeDecision('DROP', 'stylesheet size rules changed for this element')
          delete store[key]
          continue
        }
        recordSizeDecision('KEEP', 'AI did not resize this element')
        continue
      }
      // Other keys (subtitle, footer, generic text) â€” left alone here.
      // They're handled by pruneStalePollStyleOverridesInStore against the
      // live poll data, and by the bridge's own re-match fallback.
    }
  }

  function safeParseJSON(value) {
    if (typeof value !== 'string') return null
    try { return JSON.parse(value) } catch { return null }
  }

  function locateQuestionInDoc(doc) {
    if (!doc) return null
    // 1) The bridge-tagged attribute (only present at runtime, but cheap to try).
    // 2) Common ids/classes the AI tends to emit.
    // 3) Attribute-pattern fallback for ids/classes that contain "question"
    //    or "title" but don't match the hardcoded list (e.g. #question-text,
    //    #question-area, .pollQuestionWrap). Excludes #total-votes so a
    //    "total" id doesn't fall in here.
    const direct =
      doc.querySelector(attrEqI('data-prezo-editable', 'question')) ||
      doc.querySelector(
        '#poll-question, #pollQuestion, #question, #poll-title, #pollTitle, ' +
        '#question-text, #questionText, #question-area, #questionArea, ' +
        '#poll-heading, #poll-headline, #pollHeading, #pollHeadline'
      ) ||
      doc.querySelector('.poll-question, .poll-q, .poll-title, .poll-heading, .poll-headline')
    if (direct) return direct
    return findByIdOrClassPattern(doc, /(^|[-_])(question|q\-text|q\-area|title|heading|headline)([-_]|$)/i, {
      excludeIdPattern: /total|vote/i,
      excludeClassPattern: /total|vote/i
    })
  }

  // Walk every element in `doc` and return the first whose id or any class
  // matches `pattern`. Skips elements whose id/class also matches an exclude
  // pattern (so #total-votes doesn't get picked up by a "title" search).
  function findByIdOrClassPattern(doc, pattern, options = {}) {
    if (!doc || !doc.body) return null
    const all = doc.body.querySelectorAll('*')
    const excludeId = options.excludeIdPattern || null
    const excludeClass = options.excludeClassPattern || null
    for (let i = 0; i < all.length; i++) {
      const el = all[i]
      const id = (el.id || '')
      if (id && pattern.test(id)) {
        if (excludeId && excludeId.test(id)) continue
        return el
      }
      const cls = (el.getAttribute('class') || '')
      if (cls) {
        const tokens = cls.split(/\s+/)
        for (const token of tokens) {
          if (!token) continue
          if (!pattern.test(token)) continue
          if (excludeClass && excludeClass.test(token)) { continue }
          return el
        }
      }
    }
    return null
  }

  function locatePositionTarget(doc, stableId, role, optionId, label, anchor) {
    if (!doc) return null
    if (stableId) {
      const direct = doc.querySelector(attrEqI('data-prezo-pos-id', stableId)) ||
        doc.querySelector(attrEqI('data-prezo-text-id', stableId))
      if (direct) return direct
    }
    if (role === 'option-row' && optionId) return locateOptionRowInDoc(doc, optionId)
    if (role === 'poll-question') return locateQuestionInDoc(doc)
    if (role === 'poll-footer') {
      const footerDirect =
        doc.querySelector(attrEqI('data-prezo-editable', 'footer')) ||
        doc.querySelector(
          '#total-votes-text, #total-votes-display, #total-votes, #totalVotes, ' +
          '#vote-counter, #pollFooter, #poll-footer, #footer, #vote-count, ' +
          '#total-vote-count, #pollTotal, #poll-total'
        ) ||
        doc.querySelector('.total-votes, .vote-counter, .poll-footer, .poll-total, .vote-count, .poll-vote-count')
      if (footerDirect) return footerDirect
      return findByIdOrClassPattern(doc, /(^|[-_])(footer|total[-_]?vote|vote[-_]?count|vote[-_]?counter)([-_]|$)/i)
    }
    if (role === 'poll-subtitle') {
      const subtitleDirect =
        doc.querySelector(attrEqI('data-prezo-editable', 'subtitle')) ||
        doc.querySelector('#poll-subtitle, #pollSubtitle, #subtitle, #poll-sub, #pollSub') ||
        doc.querySelector('.poll-subtitle, .subtitle, .sub-title, .poll-sub, .eyebrow')
      if (subtitleDirect) return subtitleDirect
      return findByIdOrClassPattern(doc, /(^|[-_])(subtitle|sub[-_]?title|eyebrow)([-_]|$)/i)
    }
    if (role === 'background') return doc.querySelector('[data-prezo-background-layer]')
    if (role === 'foreground') return doc.querySelector('[data-prezo-foreground-layer]')
    // Generic-element rescue: the in-iframe bridge saves a CSS-selector-shaped
    // label ("tag#id" / "tag.class" / "tag") for arbitrary selectables. Use
    // it as the locator on both sides of the diff so dropOverridesAiChanged
    // can decide DROP vs KEEP via stylesheetRulesChangedForElement instead of
    // falling through to the "runtime-rendered (KEEP)" default.
    if (role === 'element') {
      return locateLabelSelectorInDoc(doc, label, anchor)
    }
    return null
  }

  function locateLabelSelectorInDoc(doc, label, anchor) {
    if (!doc || !doc.body) return null
    const selector = typeof label === 'string' ? label.trim() : ''
    if (!selector) return null
    const anchorSel = typeof anchor === 'string' ? anchor.trim() : ''
    if (anchorSel) {
      try {
        const anchorEl = doc.body.querySelector(anchorSel)
        if (anchorEl) {
          const scoped = anchorEl.querySelector(selector)
          if (scoped) return scoped
        }
      } catch {}
    }
    try {
      return doc.body.querySelector(selector)
    } catch {
      return null
    }
  }

  /**
   * The AI took explicit control of THIS element's position. Signals are
   * limited to inline style attributes because that's the only thing we
   * can read from a parsed HTML string (computed styles need a live DOM).
   *
   *   transform: translate(...)
   *   position: absolute|fixed (with top/left/right/bottom)
   *   margin: <something> auto or auto on horizontal sides
   *
   * Returns true if any of these positioning intents appear inline on
   * the element. Stylesheet-driven moves are NOT detected here â€” those
   * are caught by parentLayoutChanged.
   */
  function hasExplicitPositioning(el) {
    if (!el) return false
    const style = (el.getAttribute('style') || '').toLowerCase()
    if (!style) return false
    if (/\btransform\s*:[^;]*\btranslate/i.test(style)) return true
    if (/\bposition\s*:\s*(absolute|fixed)/i.test(style)) {
      // With absolute/fixed we'd expect top/left/right/bottom alongside.
      if (/\b(top|left|right|bottom)\s*:/i.test(style)) return true
    }
    return false
  }

  /**
   * The AI changed the element's PARENT in a way that affects rendered
   * position. We look at:
   *   - the parent itself swapped to a different element (id changed)
   *   - the parent gained or lost layout-affecting inline style (display,
   *     justify-content, align-items, flex-direction, text-align)
   *
   * We deliberately do NOT trip on arbitrary parent class changes â€” the
   * AI often renames classes during rewrites without actually changing
   * layout, and we don't want to drop overrides on those.
   */
  function parentLayoutChanged(prior, next) {
    if (!prior || !next) return false
    const pa = prior.parentElement
    const na = next.parentElement
    if (!pa && !na) return false
    if (!pa || !na) return true
    if (pa.id !== na.id) return true
    const paStyle = (pa.getAttribute('style') || '').toLowerCase()
    const naStyle = (na.getAttribute('style') || '').toLowerCase()
    const LAYOUT_PROPS = /(display|justify-content|align-items|align-content|flex-direction|flex-wrap|text-align|grid-template|gap|column-gap|row-gap)\s*:/g
    const paLayout = (paStyle.match(LAYOUT_PROPS) || []).sort().join('|')
    const naLayout = (naStyle.match(LAYOUT_PROPS) || []).sort().join('|')
    if (paLayout !== naLayout) return true
    // Compare the actual layout property VALUES, not just presence.
    for (const prop of ['display', 'justify-content', 'align-items', 'align-content', 'flex-direction', 'text-align']) {
      if (extractInlineProp(paStyle, prop) !== extractInlineProp(naStyle, prop)) return true
    }
    return false
  }

  function extractInlineProp(styleText, prop) {
    if (!styleText) return ''
    const re = new RegExp(`\\b${prop}\\s*:\\s*([^;]+)`, 'i')
    const m = styleText.match(re)
    return m ? m[1].trim().toLowerCase() : ''
  }

  /**
   * Detect AI-driven position changes that happen via stylesheet rules
   * inside <style> blocks (rather than inline element attributes).
   *
   * The AI often "moves" an element by rewriting its CSS rule, e.g.:
   *
   *   #poll-question { position: absolute; top: 20px; right: 20px; }
   *
   * The element's own tag/class/inline-style stays identical, so
   * signaturesDiffer and parentLayoutChanged both miss the change. This
   * helper extracts all <style> text from both docs, picks out the rules
   * that target THIS element (by id selector or class selector), and
   * compares the LAYOUT-relevant declarations between prior and new.
   *
   * Heuristic; not a full CSS parser. Tracks the properties that actually
   * affect rendered position: position, top/left/right/bottom, margin,
   * transform, display, justify-content, align-items, text-align.
   */
  function stylesheetRulesChangedForElement(priorDoc, nextDoc, priorEl, nextEl) {
    if (!priorEl || !nextEl) return false
    const selectors = candidateSelectorsForElement(priorEl, nextEl)
    if (!selectors.length) return false
    const priorRules = extractLayoutRulesForSelectors(priorDoc, selectors)
    const nextRules = extractLayoutRulesForSelectors(nextDoc, selectors)
    return priorRules !== nextRules
  }

  // For elements that the artifact renders at runtime (option rows, etc.)
  // we can't pull selectors from a parsed DOM node â€” the node doesn't exist
  // on either side. Synthesize a selector set from the known container ids
  // for the role plus the well-known option-row class fragments. The
  // extractor only keeps rules whose body actually carries layout decls,
  // so adding extra selectors here is safe.
  function runtimeRenderedSelectors(priorDoc, nextDoc, role) {
    const out = new Set()
    if (role !== 'option-row' && role !== 'option-label' && role !== 'option-bar') {
      return Array.from(out)
    }
    out.add('#options-container')
    out.add('#options')
    out.add('#poll-options')
    out.add('#poll-options-container')
    // Common class fragments used across artifacts for option rows.
    const knownClasses = [
      'tower-col', 'option-row', 'option-item', 'option', 'opt',
      'poll-option', 'choice', 'choice-row', 'answer', 'answer-row',
      'lane', 'lane-row', 'bar-row', 'option-bar'
    ]
    for (const c of knownClasses) out.add('.' + c)
    // Also harvest selectors from the existing stylesheet text that target
    // any of the well-known container ids â€” covers AI rewrites that
    // introduced a child-targeting rule like `.tower-col:nth-child(1)`.
    return Array.from(out)
  }

  function candidateSelectorsForElement(priorEl, nextEl) {
    const out = new Set()
    // Include the element itself plus a few ancestor levels. The AI can move
    // an element by changing the container's text-align / align-items /
    // justify-content rather than the element's own rule; without ancestor
    // coverage those moves slip past the override-drop check.
    collectSelectorsFromChain(priorEl, out, 4)
    collectSelectorsFromChain(nextEl, out, 4)
    return Array.from(out)
  }

  function collectSelectorsFromChain(el, out, maxDepth) {
    let cur = el
    let depth = 0
    while (cur && cur.nodeType === 1 && depth <= maxDepth) {
      const id = cur.id || ''
      if (id) out.add('#' + id)
      const classes = (cur.getAttribute && (cur.getAttribute('class') || '')).split(/\s+/).filter(Boolean)
      for (const c of classes) out.add('.' + c)
      cur = cur.parentElement
      depth += 1
    }
  }

  function getAllStyleText(doc) {
    if (!doc) return ''
    let combined = ''
    try {
      const styleEls = doc.querySelectorAll('style')
      if (styleEls && styleEls.length) {
        for (let i = 0; i < styleEls.length; i++) {
          combined += (styleEls[i].textContent || '') + '\n'
        }
      }
    } catch {}
    return combined
  }

  // Layout properties whose value-changes affect rendered position.
  const LAYOUT_PROP_PATTERN = /(position|top|left|right|bottom|margin(?:-[a-z]+)?|transform|display|justify-content|align-items|align-self|text-align|float|inset|order|grid-column|grid-row|grid-area|flex-direction|flex-wrap)\s*:\s*([^;}]+)/gi

  // Size properties whose value-changes affect rendered dimensions. Used by
  // the size-override AI-edit reconciliation path: when these change for
  // the resized element, the manual scale override is dropped so the AI's
  // intent wins; otherwise the override is kept.
  const SIZE_PROP_PATTERN = /(width|height|min-width|min-height|max-width|max-height|transform|scale|flex|flex-basis|flex-grow|flex-shrink|font-size|aspect-ratio|zoom)\s*:\s*([^;}]+)/gi

  /**
   * Extract the layout-relevant declarations from all CSS rules that
   * mention any of the supplied selectors. Returns a normalised string
   * for direct equality comparison between prior and new docs.
   */
  function extractLayoutRulesForSelectors(doc, selectors) {
    return extractCssDeclsForSelectors(doc, selectors, LAYOUT_PROP_PATTERN)
  }

  function extractSizeRulesForSelectors(doc, selectors) {
    return extractCssDeclsForSelectors(doc, selectors, SIZE_PROP_PATTERN)
  }

  function extractCssDeclsForSelectors(doc, selectors, propPattern) {
    const text = getAllStyleText(doc)
    if (!text || !selectors.length) return ''
    const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '')
    const collected = []
    const ruleRegex = /([^{}]+)\{([^{}]*)\}/g
    let m
    while ((m = ruleRegex.exec(cleaned)) !== null) {
      const selectorText = m[1].trim().toLowerCase()
      const body = m[2]
      if (!selectorText) continue
      let referenced = false
      for (const sel of selectors) {
        const needle = sel.toLowerCase()
        const tokenRe = new RegExp(`(^|[^a-z0-9_-])${escapeRegexp(needle)}([^a-z0-9_-]|$)`, 'i')
        if (tokenRe.test(selectorText)) { referenced = true; break }
      }
      if (!referenced) continue
      const decls = []
      let d
      const propRe = new RegExp(propPattern.source, 'gi')
      while ((d = propRe.exec(body)) !== null) {
        const prop = d[1].toLowerCase().trim()
        const val = d[2].replace(/\s+/g, ' ').trim().toLowerCase()
        decls.push(`${prop}:${val}`)
      }
      if (decls.length) {
        decls.sort()
        collected.push(`${selectorText}{${decls.join(';')}}`)
      }
    }
    collected.sort()
    return collected.join('|')
  }

  function stylesheetSizeRulesChangedForElement(priorDoc, nextDoc, priorEl, nextEl) {
    if (!priorEl || !nextEl) return false
    const selectors = candidateSelectorsForElement(priorEl, nextEl)
    if (!selectors.length) return false
    return extractSizeRulesForSelectors(priorDoc, selectors) !== extractSizeRulesForSelectors(nextDoc, selectors)
  }

  // Same shape as `hasExplicitPositioning` but for size: did the AI emit
  // an inline width/height/transform-scale on this element?
  function hasExplicitSizing(el) {
    if (!el) return false
    const style = (el.getAttribute('style') || '').toLowerCase()
    if (!style) return false
    if (/\btransform\s*:[^;]*\bscale\b/i.test(style)) return true
    if (/\b(?:width|height|min-width|min-height|max-width|max-height|font-size)\s*:\s*[^;]+/i.test(style)) return true
    return false
  }

  function escapeRegexp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function locateOptionRowInDoc(doc, optionId) {
    if (!doc || !optionId) return null
    return (
      doc.querySelector(attrEqI('data-option-id', optionId)) ||
      doc.querySelector(attrEqI('data-prezo-option-id', optionId)) ||
      doc.querySelector(attrEqI('data-opt-id', optionId)) ||
      doc.querySelector(attrEqI('data-poll-option-id', optionId)) ||
      doc.querySelector(attrEqI('data-lane-id', optionId))
    )
  }

  function locateOptionLabelInDoc(doc, optionId) {
    const row = locateOptionRowInDoc(doc, optionId)
    if (!row) return null
    return (
      row.querySelector(attrEqI('data-prezo-editable', 'option-label')) ||
      row.querySelector('.option-label, .opt-label, .lane-label, .bar-label, .choice-label, .answer-label, .label')
    )
  }

  function cssAttrEscape(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }

  // Case-insensitive attribute-value matcher. The AI rebuild may re-emit
  // attribute values with different casing than the manual-edit pipeline
  // recorded (e.g. a stableId or option id round-tripped through a JSON
  // serializer or rewritten by the model). Without the `i` flag the
  // querySelector silently misses and the caller falls into "element not
  // found" branches â€” see the override-not-cleared bug where the user moved
  // the title, the AI moved it too, but the override re-applied on top.
  function attrEqI(name, value) {
    return `[${name}="${cssAttrEscape(value)}" i]`
  }

  /**
   * Compute a signature for an element capturing the visual presentation
   * the user would care about: inline style, classes, tag, and a normalised
   * text fingerprint. Two elements with identical signatures are treated
   * as "the AI didn't change this" for override-pruning purposes.
   */
  function signatureFor(el) {
    if (!el) return ''
    const tag = (el.tagName || '').toLowerCase()
    const style = (el.getAttribute('style') || '').replace(/\s+/g, ' ').trim()
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).sort().join(' ')
    const id = el.id || ''
    // Text fingerprint: strip whitespace; cap length so a long content
    // change registers but minor whitespace tweaks don't.
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    return `${tag}|${id}|${cls}|${style}|${text}`
  }

  function signaturesDiffer(a, b) {
    return signatureFor(a) !== signatureFor(b)
  }

  /**
   * Saved style overrides embed full HTML for question / option labels. When the same
   * artifact is used for another poll, those keys still hold the previous poll's copy;
   * applyArtifactStyleOverrides would overwrite the renderer's correct text until the
   * next vote (payload churn). Drop mismatched keys from saved + pending so we only
   * reapply styling when the underlying copy still matches the live poll.
   *
   * @param {object | null | undefined} poll
   */
  function pruneStalePollStyleOverrides(poll) {
    pruneStalePollStyleOverridesInStore(state.artifact.savedStyleOverrides, poll)
    pruneStalePollStyleOverridesInStore(getPendingStyleOverrides(), poll)
  }

  return {
    dropOverridesAiChanged,
    pruneStalePollStyleOverrides,
    pruneStalePollStyleOverridesInStore
  }
}
