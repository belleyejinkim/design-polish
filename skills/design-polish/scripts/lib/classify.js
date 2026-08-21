'use strict';
// Decides which of the 11 component types an effective element is. Order matters:
// explicit roles (what assistive tech sees) beat tags, tags beat names, names beat
// heuristics. Unnamed spans that merely look like badges are returned with
// confidence 'heuristic' so the report can show them as candidates, not facts.

const TYPES = ['button', 'checkbox', 'dropdown-menu', 'radio', 'select', 'textarea', 'text-field', 'toggle', 'badge', 'tag', 'chip'];

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'datetime-local', 'month', 'week', 'time']);
const NON_CONTROL_INPUT_TYPES = new Set(['hidden', 'file', 'range', 'color', 'image']);

const NAME_HINTS = [
  [/checkbox/i, 'checkbox'],
  [/radio/i, 'radio'],
  [/switch|toggle/i, 'toggle'],
  [/textarea/i, 'textarea'],
  [/dropdown|menu(?!bar)/i, 'dropdown-menu'],
  [/select|combobox/i, 'select'],
  [/input|textfield|text-field/i, 'text-field'],
  [/badge/i, 'badge'],
  [/\btag\b|tag$/i, 'tag'],
  [/chip/i, 'chip'],
  [/button|btn/i, 'button'],
];

function nameHint(names) {
  for (const n of names) for (const [re, type] of NAME_HINTS) if (re.test(n)) return type;
  return null;
}

/**
 * @param {object} eff effective element from resolve-usage
 * @param {object} jsxInfo the usage element
 * @returns {{ type: string, basis: string, confidence: 'exact'|'heuristic', subtype?: string, role?: string } | null}
 */
function detect(eff, jsxInfo, opts = {}) {
  const role = eff.role || null;
  const tag = eff.tag;
  const attrs = eff.attrs || {};
  // Library primitives that render nothing themselves (Radix Root, Portal) are not controls.
  if (tag === null && !eff.unresolvedReason && eff.implRef && (eff.implRef.kind === 'library' || eff.implRef.primitive)) return null;
  const names = [opts.componentName, ...(eff.chain || []).map((c) => c.name), jsxInfo.tag, eff.implRef && eff.implRef.name].filter(Boolean);

  // 1. roles
  if (role === 'checkbox') return { type: 'checkbox', basis: 'role', confidence: 'exact', role };
  if (role === 'radio') return { type: 'radio', basis: 'role', confidence: 'exact', role };
  if (role === 'switch' || role === 'toggle-button') return { type: 'toggle', basis: 'role', confidence: 'exact', role };
  if (role === 'combobox') return { type: 'select', basis: 'role', confidence: 'exact', role };
  if (role === 'listbox' || role === 'option') return null; // the open panel of a select, not the control
  if (role === 'menu') return { type: 'dropdown-menu', basis: 'role', confidence: 'exact', role };
  if (role === 'menuitem' || role === 'menuitemcheckbox' || role === 'menuitemradio') return { type: 'dropdown-menu', basis: 'role', confidence: 'exact', role, subtype: 'item' };
  if (role === 'dropdown-trigger' || role === 'popover-trigger' || role === 'dialog-trigger') return { type: 'button', basis: 'role', confidence: 'exact', role };
  if (role === 'button') return { type: 'button', basis: 'role', confidence: 'exact', role };
  if (role === 'tab' || role === 'separator' || role === 'option' || role === 'dialog' || role === 'tabpanel' || role === 'tablist' || role === 'radiogroup' || role === 'group' || role === 'slider') return null;

  // 2. tags
  if (tag === 'input') {
    const t = typeof attrs.type === 'string' ? attrs.type.toLowerCase() : (attrs.type === undefined ? 'text' : null);
    if (t === 'checkbox') return { type: 'checkbox', basis: 'input-type', confidence: 'exact' };
    if (t === 'radio') return { type: 'radio', basis: 'input-type', confidence: 'exact' };
    if (t === 'submit' || t === 'button' || t === 'reset') return { type: 'button', basis: 'input-type', confidence: 'exact' };
    if (t === null) return { type: 'text-field', basis: 'input-type', confidence: 'heuristic', note: 'dynamic type' };
    if (NON_CONTROL_INPUT_TYPES.has(t)) return null;
    if (TEXT_INPUT_TYPES.has(t)) return { type: 'text-field', basis: 'input-type', confidence: 'exact', subtype: t === 'search' ? 'search' : undefined };
    return { type: 'text-field', basis: 'input-type', confidence: 'heuristic' };
  }
  if (tag === 'select') return { type: 'select', basis: 'tag', confidence: 'exact' };
  if (tag === 'textarea') return { type: 'textarea', basis: 'tag', confidence: 'exact' };
  if (tag === 'button') {
    // A <button> rendered by a component named Chip/Badge/Tag is that thing, not a generic button.
    const hint = nameHint(names.filter((n) => /chip|badge|\btag\b|tag$/i.test(n)));
    if (hint) return { type: hint, basis: 'name', confidence: 'exact' };
    if (attrs['aria-pressed'] !== undefined) return { type: 'toggle', basis: 'aria-pressed', confidence: 'exact' };
    return { type: 'button', basis: 'tag', confidence: 'exact' };
  }
  if (tag === 'a') {
    const hint = nameHint(names);
    if (hint === 'button') return { type: 'button', basis: 'name', confidence: 'exact', subtype: 'link-button' };
    return { type: 'button', basis: 'link-heuristic', confidence: 'candidate', subtype: 'link-button' }; // confirmed later from declarations
  }

  // 3. component names (for elements whose tag we could not resolve, or span/div-based components)
  const hint = nameHint(names);
  if (hint) {
    // A local binding that is not a component (a Context.Provider, a render-prop wrapper) renders no control itself.
    if (tag === null && (eff.unresolvedReason === 'not-a-component' || eff.unresolvedReason === 'no-root' || eff.unresolvedReason === 'aschild-without-child')) return null;
    if (tag === null) return { type: hint, basis: 'name', confidence: 'partial' };
    if (tag === 'span' || tag === 'div' || tag === 'label' || tag === 'li') {
      if (hint === 'badge' || hint === 'tag' || hint === 'chip') return { type: hint, basis: 'name', confidence: 'exact' };
      if (hint === 'dropdown-menu' && /content$/i.test(jsxInfo.tag)) return { type: 'dropdown-menu', basis: 'name', confidence: 'heuristic' };
      if (hint === 'dropdown-menu' || hint === 'select') return null; // indicators, labels, groups, separators
    }
  }
  // 4. heuristic for unnamed badge-like spans is decided in scan.js once declarations are known.
  if (tag === 'span' || tag === 'div') return { type: null, basis: 'pending-heuristic', confidence: 'heuristic' };
  return null;
}

/** Badge/tag/chip look: inline, small text, horizontal padding, rounded. Decided from resolved declarations. */
function badgeLikeHeuristic(decl) {
  const base = decl.base || {};
  const display = base.display || '';
  const inline = /inline/.test(display);
  const fs = decl.computed && decl.computed.fontSizePx;
  const small = fs != null && fs <= 13; // 13px: anything larger reads as body text, not a label
  const padded = decl.computed && decl.computed.paddingX != null && decl.computed.paddingX > 0;
  const rounded = base['border-radius'] !== undefined;
  const colored = base['background-color'] !== undefined || base['border-width'] !== undefined || base['border-color'] !== undefined;
  if (inline && small && padded && rounded && colored) return { type: 'badge', basis: 'heuristic', confidence: 'heuristic' };
  return null;
}

/** Link-button look: an <a> with a background or border plus padding and radius. */
function linkButtonHeuristic(decl) {
  const base = decl.base || {};
  const padded = decl.computed && decl.computed.paddingX != null && decl.computed.paddingX > 0;
  const boxed = base['background-color'] !== undefined || base['border-width'] !== undefined;
  const rounded = base['border-radius'] !== undefined;
  return padded && boxed && rounded;
}

module.exports = { detect, nameHint, badgeLikeHeuristic, linkButtonHeuristic, TYPES, NAME_HINTS };
