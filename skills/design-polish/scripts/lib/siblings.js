'use strict';
// Finds controls that sit next to each other in one row or grid and compares the
// values a person sees side by side: corner radius and height. A button that is
// 8px-rounded next to an input that is 6px-rounded is a real defect even though
// both values are "legal" in the scale. This is the relationship check the v1
// regex scanner could not do.

// Differences below 2px are sub-pixel on most displays; treating them as mismatches would be noise.
const MIN_VISIBLE_DIFF_PX = 2;

// Only controls of the same size class are expected to share height and radius: a 16px checkbox next to a
// 32px button is how forms look, not a defect. Boxes (buttons, inputs, selects, menu triggers) are compared
// with boxes, small marks with small marks, inline labels with inline labels.
const SIZE_CLASS = { button: 'box', 'text-field': 'box', select: 'box', 'dropdown-menu': 'box', textarea: 'area', checkbox: 'mark', radio: 'mark', toggle: 'mark', badge: 'label', tag: 'label', chip: 'label' };
const sizeClassOf = (type) => SIZE_CLASS[type] || 'other';

function layoutOf(tokens) {
  const has = (re) => tokens.some((t) => re.test(t));
  if (has(/^(?:inline-)?grid$/)) return 'grid';
  if (has(/^(?:inline-)?flex$/)) return has(/^flex-col(?:-reverse)?$/) ? 'col' : 'row';
  return 'unknown';
}

/**
 * @param {Map<string, object>} indexes file indexes
 * @param {Map<object, object>} occByNode JSX node -> occurrence (with sigId, type, computed)
 * @param {(jsxInfo) => string[]} classesOf resolved class tokens of any element (for the container)
 */
function groups(indexes, occByNode, classesOf, fileRoutes, seeThrough = () => false) {
  const out = [];
  for (const index of indexes.values()) {
    for (const el of index.jsx) {
      if (!el.children || el.children.length < 2) continue;
      const members = [];
      for (const child of el.children) {
        const occ = occByNode.get(child.node);
        if (occ) { members.push({ child, occ }); continue; }
        // Wrappers that render nothing themselves (DropdownMenu root, Slot) contribute the first control inside them.
        if (seeThrough(child)) { const inner = child.children.find((c) => occByNode.get(c.node)); if (inner) members.push({ child: inner, occ: occByNode.get(inner.node) }); }
      }
      if (members.length < 2) continue;
      const layout = layoutOf(classesOf(el));
      if (layout !== 'row' && layout !== 'grid') continue;
      const fr = fileRoutes.get(index.rel) || { routes: [], layouts: [] };
      // one group per size class present in the row (a row with two buttons and a checkbox yields one 'box' group)
      const byClass = new Map();
      for (const m of members) { const k = sizeClassOf(m.occ.type); if (!byClass.has(k)) byClass.set(k, []); byClass.get(k).push(m); }
      for (const [sizeClass, list] of byClass) {
        if (list.length < 2) continue;
        const radius = list.map((m) => m.occ.computed ? m.occ.computed.radiusPx : null);
        const height = list.map((m) => m.occ.computed ? m.occ.computed.heightPx : null);
        const mismatch = { radius: differs(radius), height: sizeClass === 'area' ? false : differs(height) };
        out.push({
          id: require('./ids').groupId(index.rel, el.line + (byClass.size > 1 ? '#' + sizeClass : '')),
          file: index.rel, line: el.line, layout, sizeClass, containerClasses: classesOf(el).join(' '),
          members: list.map((m) => m.occ.id), memberTypes: list.map((m) => m.occ.type),
          routes: fr.routes, layoutScope: fr.layouts,
          radiusPx: radius, heightPx: height, mismatch,
        });
      }
    }
  }
  return out;
}

function differs(values) {
  const nums = values.filter((v) => typeof v === 'number' && isFinite(v));
  if (nums.length < 2) return false;
  return Math.max(...nums) - Math.min(...nums) >= MIN_VISIBLE_DIFF_PX;
}

module.exports = { groups, layoutOf, differs, sizeClassOf, MIN_VISIBLE_DIFF_PX, SIZE_CLASS };
