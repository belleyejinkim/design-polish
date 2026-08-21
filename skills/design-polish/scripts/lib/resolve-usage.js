'use strict';
// Turns a JSX usage such as <Button variant="outline" size="sm" className="mt-2">
// into the *effective element*: the HTML tag that ends up in the DOM and the full,
// ordered class list that styles it, after following component definitions,
// wrappers (PrimaryButton → Button), cva variants, `asChild`/Slot and data-attribute
// variants. Library components we cannot see into are reported as such, not guessed.

const { evaluate, evalCond, staticValue, resolveIdent, emptySet, merge, addTokens, fromString } = require('./class-eval');

// How deep a wrapper chain we follow. Four levels covers PrimaryButton → Button → Comp;
// deeper chains are design-system internals and are reported as 'depth'.
const MAX_WRAPPER_DEPTH = 4;

// Known headless primitives: what element they render and which role it carries.
// Keyed by package, then by the imported name / member path.
const PRIMITIVES = {
  '@radix-ui/react-slot': { Slot: { passthrough: true } },
  '@radix-ui/react-checkbox': { Root: { tag: 'button', role: 'checkbox' }, Indicator: { tag: 'span' } },
  '@radix-ui/react-radio-group': { Root: { tag: 'div', role: 'radiogroup' }, Item: { tag: 'button', role: 'radio' }, Indicator: { tag: 'span' } },
  '@radix-ui/react-switch': { Root: { tag: 'button', role: 'switch' }, Thumb: { tag: 'span' } },
  '@radix-ui/react-toggle': { Root: { tag: 'button', role: 'toggle-button' } },
  '@radix-ui/react-toggle-group': { Root: { tag: 'div', role: 'group' }, Item: { tag: 'button', role: 'toggle-button' } },
  '@radix-ui/react-dropdown-menu': { Root: { tag: null }, Trigger: { tag: 'button', role: 'dropdown-trigger' }, Content: { tag: 'div', role: 'menu' }, Item: { tag: 'div', role: 'menuitem' }, CheckboxItem: { tag: 'div', role: 'menuitemcheckbox' }, RadioItem: { tag: 'div', role: 'menuitemradio' }, SubTrigger: { tag: 'div', role: 'menuitem' }, SubContent: { tag: 'div', role: 'menu' }, Separator: { tag: 'div', role: 'separator' }, Label: { tag: 'div' }, Group: { tag: 'div' }, Portal: { tag: null }, Sub: { tag: null }, RadioGroup: { tag: 'div' }, Shortcut: { tag: 'span' } },
  '@radix-ui/react-select': { Root: { tag: null }, Trigger: { tag: 'button', role: 'combobox' }, Content: { tag: 'div', role: 'listbox' }, Item: { tag: 'div', role: 'option' }, ItemText: { tag: 'span' }, ItemIndicator: { tag: 'span' }, Value: { tag: 'span' }, Icon: { tag: 'span' }, Viewport: { tag: 'div' }, Group: { tag: 'div' }, Label: { tag: 'div' }, Separator: { tag: 'div' }, ScrollUpButton: { tag: 'div' }, ScrollDownButton: { tag: 'div' }, Portal: { tag: null } },
  '@radix-ui/react-popover': { Trigger: { tag: 'button', role: 'popover-trigger' }, Content: { tag: 'div', role: 'dialog' } },
  '@radix-ui/react-dialog': { Trigger: { tag: 'button', role: 'dialog-trigger' }, Close: { tag: 'button' }, Content: { tag: 'div', role: 'dialog' } },
  '@radix-ui/react-alert-dialog': { Trigger: { tag: 'button', role: 'dialog-trigger' }, Action: { tag: 'button' }, Cancel: { tag: 'button' } },
  '@radix-ui/react-tabs': { Trigger: { tag: 'button', role: 'tab' }, List: { tag: 'div', role: 'tablist' }, Content: { tag: 'div', role: 'tabpanel' } },
  '@radix-ui/react-label': { Root: { tag: 'label' } },
  '@radix-ui/react-accordion': { Trigger: { tag: 'button' } },
  '@radix-ui/react-collapsible': { Trigger: { tag: 'button' } },
  '@radix-ui/react-tooltip': { Trigger: { tag: 'button' } },
  '@radix-ui/react-hover-card': { Trigger: { tag: 'a' } },
  '@radix-ui/react-menubar': { Trigger: { tag: 'button' }, Item: { tag: 'div', role: 'menuitem' }, Content: { tag: 'div', role: 'menu' } },
  '@radix-ui/react-navigation-menu': { Trigger: { tag: 'button' }, Link: { tag: 'a' } },
  '@radix-ui/react-slider': { Root: { tag: 'span', role: 'slider' } },
  '@headlessui/react': { Switch: { tag: 'button', role: 'switch' }, Checkbox: { tag: 'span', role: 'checkbox' }, Radio: { tag: 'span', role: 'radio' }, Button: { tag: 'button' }, Input: { tag: 'input' }, Textarea: { tag: 'textarea' }, Select: { tag: 'select' }, 'Menu.Button': { tag: 'button', role: 'dropdown-trigger' }, MenuButton: { tag: 'button', role: 'dropdown-trigger' }, 'Menu.Item': { tag: 'div', role: 'menuitem' }, MenuItem: { tag: 'div', role: 'menuitem' }, 'Listbox.Button': { tag: 'button', role: 'combobox' }, ListboxButton: { tag: 'button', role: 'combobox' } },
  'next/link': { default: { tag: 'a' } },
  'next/image': { default: { tag: 'img' } },
  'react-router-dom': { Link: { tag: 'a' }, NavLink: { tag: 'a' } },
  'react-router': { Link: { tag: 'a' }, NavLink: { tag: 'a' } },
};
// The unified `radix-ui` package re-exports each primitive as a namespace: import { Checkbox as CheckboxPrimitive } from 'radix-ui'
const RADIX_UNIFIED = { Checkbox: '@radix-ui/react-checkbox', RadioGroup: '@radix-ui/react-radio-group', Switch: '@radix-ui/react-switch', Toggle: '@radix-ui/react-toggle', ToggleGroup: '@radix-ui/react-toggle-group', DropdownMenu: '@radix-ui/react-dropdown-menu', Select: '@radix-ui/react-select', Popover: '@radix-ui/react-popover', Dialog: '@radix-ui/react-dialog', AlertDialog: '@radix-ui/react-alert-dialog', Tabs: '@radix-ui/react-tabs', Label: '@radix-ui/react-label', Slot: '@radix-ui/react-slot', Accordion: '@radix-ui/react-accordion', Collapsible: '@radix-ui/react-collapsible', Tooltip: '@radix-ui/react-tooltip', HoverCard: '@radix-ui/react-hover-card', Menubar: '@radix-ui/react-menubar', NavigationMenu: '@radix-ui/react-navigation-menu', Slider: '@radix-ui/react-slider' };
// Icon packages render <svg>; never a control, so we can stop early.
const ICON_PKGS = new Set(['lucide-react', '@heroicons/react', 'react-icons', '@tabler/icons-react', '@phosphor-icons/react', '@radix-ui/react-icons', 'iconoir-react']);

function primitiveFor(pkg, importedName, member) {
  // Slot in any of its spellings: Slot, Slot.Root, { Slot } from 'radix-ui', @radix-ui/react-slot
  if (pkg === '@radix-ui/react-slot' || ((pkg === 'radix-ui' || pkg.startsWith('@radix-ui/')) && importedName === 'Slot')) return { passthrough: true };
  let table = PRIMITIVES[pkg];
  let key = member || importedName;
  if (pkg === 'radix-ui' && RADIX_UNIFIED[importedName]) { table = PRIMITIVES[RADIX_UNIFIED[importedName]]; key = member || 'Root'; }
  if (!table) return null;
  if (table[key]) return table[key];
  if (importedName === 'default' && table.default) return table.default;
  if (member && table[`${importedName}.${member}`]) return table[`${importedName}.${member}`];
  // A member we do not list (ItemText, Viewport, Arrow…) is a non-control part of a known primitive.
  if (member) return { tag: 'div', role: null, unknownMember: true };
  return null;
}

/** Evaluate JSX attributes into an env: static values, class sets for className, pass-throughs otherwise. */
function attrsToEnv(jsxInfo, ctx) {
  const env = {};
  const { ts } = ctx;
  // An element that spreads {...props} receives the caller's unnamed props (asChild, data-*, type, disabled...).
  if (jsxInfo.spread && ctx.spreadProps) for (const [k, v] of Object.entries(ctx.spreadProps)) if (k !== 'className' && k !== 'children') env[k] = v;
  for (const [name, a] of Object.entries(jsxInfo.attrs)) {
    if ((name === 'className' || name === 'class') && a.kind === 'string') { env[name] = { classSet: fromString(a.value, { file: ctx.index.rel, line: jsxInfo.line, col: jsxInfo.col }) }; continue; }
    if (a.kind === 'string' || a.kind === 'number') env[name] = a.value;
    else if (a.kind === 'true') env[name] = true;
    else if (a.kind === 'false') env[name] = false;
    else if (a.kind === 'expr') {
      if (name === 'className' || name === 'class') env[name] = { classSet: evaluate(a.node, ctx) };
      else if (name === 'style' && a.node && ts.isObjectLiteralExpression(a.node)) env[name] = { style: styleObject(a.node, ctx) };
      else {
        const v = staticValue(a.node, ctx);
        if (v !== undefined) env[name] = v;
        else if (a.node && ts.isIdentifier(a.node) && ctx.env && Object.prototype.hasOwnProperty.call(ctx.env, a.node.text)) env[name] = ctx.env[a.node.text]; // prop pass-through: size={size}
        else env[name] = { expr: a.text };
      }
    }
  }
  if (jsxInfo.children && jsxInfo.children.length) env.children = { expr: 'children' };
  return env;
}

/** Static entries of an inline style object: { backgroundColor: '#fff' } */
function styleObject(node, ctx) {
  const { ts, sf } = ctx;
  const out = {};
  for (const p of node.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(sf);
    const v = staticValue(p.initializer, ctx);
    out[key] = v !== undefined ? v : { expr: p.initializer.getText(sf) };
  }
  return out;
}

/** Activate data-[k=v]: variants whose attribute value is known; drop inactive ones. */
function applyDataVariants(tokens, attrs) {
  const out = [];
  const dropped = [];
  for (const t of tokens) {
    const m = /^data-\[([\w-]+)=([^\]]+)\]:(.+)$/.exec(t);
    if (!m) { out.push(t); continue; }
    const [, k, v, rest] = m;
    const have = attrs[`data-${k}`];
    if (have === undefined || (have && typeof have === 'object')) { out.push(t); continue; } // unknown at build time: keep as variant
    if (String(have) === v.replace(/^["']|["']$/g, '')) out.push(rest); else dropped.push(t);
  }
  return { tokens: out, dropped };
}

function effective(partial) {
  return Object.assign({ tag: null, role: null, attrs: {}, classSet: emptySet(), style: {}, chain: [], implRef: null, branch: null, asChild: false, unresolvedReason: null, depth: 0 }, partial);
}

function baseIdent(tagText) { return tagText.split('.')[0]; }
function memberPath(tagText) { const i = tagText.indexOf('.'); return i < 0 ? null : tagText.slice(i + 1); }

/**
 * @param {object} jsxInfo  element from index-file
 * @param {object} ctx      { ts, project, index, env, depth, cvaCache }
 */
function expandUsage(jsxInfo, ctx) {
  const { ts } = ctx;
  const depth = ctx.depth || 0;
  const attrs = attrsToEnv(jsxInfo, ctx);
  const ownClasses = attrs.className && attrs.className.classSet ? attrs.className.classSet : (typeof attrs.className === 'string' ? fromString(attrs.className, { file: ctx.index.rel, line: jsxInfo.line, col: jsxInfo.col }) : emptySet());
  const style = attrs.style && attrs.style.style ? attrs.style.style : {};
  const staticAttrs = {};
  for (const [k, v] of Object.entries(attrs)) if (v === null || typeof v !== 'object') staticAttrs[k] = v;

  if (!jsxInfo.isComponent) {
    const { tokens, dropped } = applyDataVariants(ownClasses.tokens, staticAttrs);
    const cs = { ...ownClasses, tokens };
    if (dropped.length) cs.droppedVariants = dropped;
    return effective({ tag: jsxInfo.tag, role: staticAttrs.role || null, attrs: staticAttrs, classSet: cs, style, implRef: { kind: 'native', name: jsxInfo.tag, file: ctx.index.rel }, depth });
  }

  const base = baseIdent(jsxInfo.tag);
  const member = memberPath(jsxInfo.tag);
  const r = resolveIdent(base, ctx);

  if (r.kind === 'package') {
    if (ICON_PKGS.has(r.pkg)) return effective({ tag: 'svg', attrs: staticAttrs, classSet: ownClasses, implRef: { kind: 'library', pkg: r.pkg, name: jsxInfo.tag }, depth });
    const prim = primitiveFor(r.pkg, r.imported, member) || (r.spec && r.spec !== r.pkg ? primitiveFor(r.spec, r.imported, member) : null);
    if (prim && prim.passthrough) return passThrough(jsxInfo, ctx, ownClasses, staticAttrs, style, [{ name: jsxInfo.tag, pkg: r.pkg }], depth);
    if (prim) {
      const { tokens, dropped } = applyDataVariants(ownClasses.tokens, staticAttrs);
      const cs = { ...ownClasses, tokens };
      if (dropped.length) cs.droppedVariants = dropped;
      if (staticAttrs.asChild === true) return passThrough(jsxInfo, ctx, cs, staticAttrs, style, [{ name: jsxInfo.tag, pkg: r.pkg, role: prim.role || null }], depth);
      return effective({ tag: prim.tag, role: staticAttrs.role || prim.role || null, attrs: staticAttrs, classSet: cs, style, implRef: { kind: 'library', pkg: r.pkg, name: jsxInfo.tag, primitive: r.pkg.replace('@radix-ui/react-', 'radix:') }, depth });
    }
    return effective({ tag: null, attrs: staticAttrs, classSet: ownClasses, style, implRef: { kind: 'library', pkg: r.pkg, name: jsxInfo.tag }, unresolvedReason: 'library-opaque', depth });
  }
  if (r.kind === 'env') {
    // <Comp ...> where Comp = asChild ? Slot : 'button' is handled in the decl branch; a component passed as a prop is dynamic.
    return effective({ tag: null, attrs: staticAttrs, classSet: ownClasses, style, unresolvedReason: 'dynamic-component', depth });
  }
  if (r.kind !== 'decl') return effective({ tag: null, attrs: staticAttrs, classSet: ownClasses, style, unresolvedReason: 'unresolved-import', depth });

  // Local declaration: a component, or a variable like `const Comp = asChild ? Slot : "button"`.
  const defIndex = r.index;
  const component = defIndex.components.find((c) => c.name === r.name);
  if (!component) {
    if (r.init) {
      const sub = { ...ctx, index: defIndex, sf: defIndex.sf };
      const v = staticValue(r.init, sub);
      if (typeof v === 'string') {
        const { tokens } = applyDataVariants(ownClasses.tokens, staticAttrs);
        return effective({ tag: v, role: staticAttrs.role || null, attrs: staticAttrs, classSet: { ...ownClasses, tokens }, style, implRef: { kind: 'native', name: v, file: defIndex.rel }, depth });
      }
      if (ts.isConditionalExpression(r.init)) {
        const c = evalCond(r.init.condition, sub);
        // `asChild ? Slot : "button"`: when asChild is unknown at build time the element is almost always rendered as-is.
        const pick = c === true ? r.init.whenTrue : r.init.whenFalse;
        const picked = staticValue(pick, sub);
        if (typeof picked === 'string') {
          const { tokens } = applyDataVariants(ownClasses.tokens, staticAttrs);
          return effective({ tag: picked, role: staticAttrs.role || null, attrs: staticAttrs, classSet: { ...ownClasses, tokens }, style, implRef: { kind: 'native', name: picked, file: defIndex.rel }, depth });
        }
        const pickText = pick.getText(defIndex.sf);
        const pickBase = pickText.split('.')[0];
        const pickMember = pickText.includes('.') ? pickText.split('.').slice(1).join('.') : null;
        if (ts.isIdentifier(pick) || ts.isPropertyAccessExpression(pick)) {
          const pr = resolveIdent(pickBase, sub);
          const prim = pr.kind === 'package' ? (primitiveFor(pr.pkg, pr.imported, pickMember) || (pr.spec ? primitiveFor(pr.spec, pr.imported, pickMember) : null)) : null;
          if (prim && prim.passthrough) return passThrough(jsxInfo, ctx, ownClasses, staticAttrs, style, [{ name: pickText, pkg: pr.pkg }], depth);
          if (prim && prim.tag) return effective({ tag: prim.tag, role: staticAttrs.role || prim.role || null, attrs: staticAttrs, classSet: ownClasses, style, implRef: { kind: 'library', pkg: pr.pkg, name: pickText, primitive: pr.pkg }, depth });
        }
      }
    }
    return effective({ tag: null, attrs: staticAttrs, classSet: ownClasses, style, unresolvedReason: 'not-a-component', depth });
  }
  if (depth >= MAX_WRAPPER_DEPTH) return effective({ tag: null, attrs: staticAttrs, classSet: ownClasses, style, chain: [{ name: component.name, file: defIndex.rel }], unresolvedReason: 'depth', depth });

  // Build the env the definition sees: defaults, then what the caller passed.
  // Every named prop exists in the env (undefined when the caller did not pass it), so `className ?? ""` or
  // `variant && …` resolve to "nothing" instead of "unknown".
  const env = {};
  for (const name of component.params.names || []) env[name] = undefined;
  Object.assign(env, component.params.defaults);
  for (const [k, v] of Object.entries(attrs)) env[k] = v;
  if (!('className' in env) && ownClasses.tokens.length === 0) env.className = undefined;
  // Props the definition does not name fall through `{...props}` onto whichever element spreads them.
  const spreadProps = {};
  const named = new Set([...component.params.names, 'children']);
  for (const [k, v] of Object.entries(attrs)) if (!named.has(k) || component.params.propsName) spreadProps[k] = v;
  if (ctx.spreadProps && jsxInfo.spread) for (const [k, v] of Object.entries(ctx.spreadProps)) if (!(k in spreadProps)) spreadProps[k] = v;
  // Children written at the usage site are what `asChild`/Slot will render; remember where they live.
  const usageSite = (jsxInfo.children && jsxInfo.children.length) ? { jsxInfo, ctx } : (ctx.usageSite || null);
  const defCtx = { ...ctx, index: defIndex, sf: defIndex.sf, env, locals: component.locals, spreadProps, usageSite, depth: depth + 1 };

  // Pick the render root whose branch condition holds under this env.
  let rootPick = null;
  for (const root of component.roots) {
    if (!root.cond) { rootPick = rootPick || root; continue; }
    const c = evalCond(root.cond.node, defCtx);
    if (c === undefined) { rootPick = rootPick || root; continue; }
    if ((c && !root.cond.negate) || (!c && root.cond.negate)) { rootPick = root; break; }
  }
  if (!rootPick) rootPick = component.roots[0];
  let rootInfo = defIndex.jsxByNode.get(rootPick.node);
  if (!rootInfo && ts.isJsxFragment(rootPick.node)) {
    // Fragment root: take the first structural child that is an element.
    const first = rootPick.node.children.find((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
    rootInfo = first ? defIndex.jsxByNode.get(first) : null;
  }
  if (!rootInfo) return effective({ tag: null, attrs: staticAttrs, classSet: ownClasses, style, chain: [{ name: component.name, file: defIndex.rel }], unresolvedReason: 'no-root', depth });

  const inner = expandUsage(rootInfo, defCtx);
  // The wrapper's own className (from the caller) is already threaded through env.className;
  // only add it if the definition never used the slot (a wrapper that ignores className).
  if (!inner.classSet.slots.includes('className') && ownClasses.tokens.length && inner.tag) {
    inner.classSet = merge({ ...inner.classSet, tokens: inner.classSet.tokens.slice(), slots: inner.classSet.slots.slice() }, ownClasses);
    inner.classSet.ignoredClassName = true;
  }
  inner.chain = [{ name: component.name, file: defIndex.rel, variantProps: pickVariantProps(attrs, component) }, ...inner.chain];
  inner.branch = inner.branch || rootPick.branch || null;
  inner.depth = depth;
  if (inner.implRef && (inner.implRef.kind === 'native' || inner.implRef.kind === 'library') && inner.chain.length && !(inner.asChild && !inner.asChildStyled)) {
    // The implementation is the innermost *local* component in the chain (skip Slot/primitive entries).
    // An unstyled pass-through wrapper (FormControl = <Slot>) leaves the child's implementation in place.
    const last = [...inner.chain].reverse().find((c) => c.file) || inner.chain[inner.chain.length - 1];
    const primitive = inner.implRef.kind === 'library' ? (inner.implRef.primitive || inner.implRef.pkg) : null;
    const idx = inner.chain.indexOf(last);
    inner.implRef = { kind: 'local-component', name: last.name, file: last.file, primitive, via: idx > 0 ? inner.chain.slice(0, idx).map((c) => c.name) : [] };
  }
  // Style from the usage site wins over inner defaults (it lands on the root through {...props}).
  inner.style = { ...inner.style, ...style };
  if (rootInfo.isComponent === false && rootInfo.attrs.style === undefined && Object.keys(style).length === 0) { /* nothing */ }
  return inner;
}

function pickVariantProps(attrs, component) {
  const out = {};
  for (const name of component.params.names) {
    if (['className', 'children', 'onClick', 'type', 'href', 'disabled', 'asChild', 'style', 'id', 'name', 'value', 'onChange', 'placeholder'].includes(name)) continue;
    const v = attrs[name];
    if (v !== undefined && (v === null || typeof v !== 'object')) out[name] = v;
  }
  return out;
}

/** asChild / Slot: the first child element becomes the rendered element and inherits the wrapper's classes. */
function passThrough(jsxInfo, ctx, wrapperClasses, wrapperAttrs, style, chain, depth) {
  // Prefer the children written at the original usage site (the definition root usually has none).
  const site = (jsxInfo.children && jsxInfo.children.length) ? { jsxInfo, ctx } : ctx.usageSite;
  const kids = site ? site.jsxInfo.children : [];
  const child = kids.find((c) => c.isComponent || !['svg', 'span'].includes(c.tag)) || kids[0];
  if (!child) return effective({ tag: null, attrs: wrapperAttrs, classSet: wrapperClasses, style, chain, unresolvedReason: 'aschild-without-child', depth });
  const inner = expandUsage(child, { ...site.ctx, usageSite: null, depth: depth + 1 });
  const cs = { ...inner.classSet, tokens: inner.classSet.tokens.slice(), conditional: inner.classSet.conditional.slice(), unknown: inner.classSet.unknown.slice(), slots: inner.classSet.slots.slice() };
  // Wrapper classes first, child's own classes last (the child's className wins conflicts, as with Slot's mergeProps).
  const mergedTokens = [];
  addTokens({ tokens: mergedTokens }, wrapperClasses.tokens);
  addTokens({ tokens: mergedTokens }, cs.tokens);
  cs.tokens = mergedTokens;
  cs.origins = { ...(wrapperClasses.origins || {}), ...(cs.origins || {}) };
  inner.classSet = cs;
  inner.asChild = true;
  inner.asChildStyled = inner.asChildStyled || wrapperClasses.tokens.length > 0; // did the wrapper contribute the look?
  inner.absorbed = child;
  inner.chain = [...chain, ...inner.chain];
  inner.role = inner.role || (chain[0] && chain[0].role) || null;
  inner.depth = depth;
  return inner;
}

module.exports = { expandUsage, attrsToEnv, applyDataVariants, primitiveFor, PRIMITIVES, ICON_PKGS, MAX_WRAPPER_DEPTH };
