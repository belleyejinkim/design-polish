'use strict';
// Maps files to the screens (routes) a user sees them on. Evidence for non-coders
// is "appears on Settings and Orders", not "line 142". Unknowns stay unknown:
// a component no route imports is reported as unreached, never attached to a guess.

const path = require('path');

const CATALOG_RE = /(^|\/)(design-system|designsystem|styleguide|style-guide|storybook|ui-kit|uikit|components-demo|component-gallery|sandbox|playground)(\/|$)/i;
const APP_FILE_RE = /^(?:src\/)?app\/(?:.*\/)?(page|layout|template|default|loading|error|not-found|global-error)\.(tsx|jsx|js|ts|mdx)$/;
const PAGES_FILE_RE = /^(?:src\/)?pages\/(.+)\.(tsx|jsx|js|ts|mdx)$/;
// Following importers deeper than this means shared utilities, not screens; cap keeps big repos fast.
const MAX_IMPORT_DEPTH = 12;

function appRoutePath(rel) {
  const m = /^(?:src\/)?app\/(.*)$/.exec(rel);
  const dir = m ? path.posix.dirname(m[1]) : '.';
  const segs = dir === '.' ? [] : dir.split('/');
  const kept = [];
  let group = null;
  for (const s of segs) {
    if (/^\(.*\)$/.test(s)) { group = s; continue; } // route group: no URL segment
    if (s.startsWith('@') || s.startsWith('_')) return null; // parallel/private: not a screen
    kept.push(s);
  }
  return { path: '/' + kept.join('/'), group };
}

function pagesRoutePath(rel) {
  const m = PAGES_FILE_RE.exec(rel);
  if (!m) return null;
  let p = m[1];
  if (/^(_app|_document|_error)$/.test(p) || p.startsWith('api/') || p === 'api') return null;
  if (p === 'index') p = '';
  p = p.replace(/\/index$/, '');
  return '/' + p;
}

/** Find `export const metadata = { title: '...' }` or a first-level <h1> text. */
function displayNameOf(index) {
  if (!index) return { display: null, basis: null };
  const meta = index.decls.get('metadata');
  if (meta && meta.init) {
    const text = meta.init.getText(index.sf);
    const m = /title\s*:\s*(['"`])([^'"`]+)\1/.exec(text);
    if (m) return { display: m[2], basis: 'metadata' };
  }
  const h1 = index.jsx.find((j) => j.tag === 'h1' && j.textLabels.length);
  if (h1) return { display: h1.textLabels[0].slice(0, 60), basis: 'h1' };
  return { display: null, basis: null };
}

function discover(indexes, files, opts = {}) {
  const routes = [];
  let router = 'none';
  const routeFiles = new Map(); // rel -> route
  const nextProject = opts.next !== false; // `pages/` is a screen only in a Next.js project
  for (const rel of files) {
    const appMatch = APP_FILE_RE.exec(rel);
    if (appMatch) {
      const fileKind = appMatch[1];
      if (!['page', 'layout', 'template'].includes(fileKind)) continue; // loading/error/not-found are states, not screens
      const kind = fileKind;
      const rp = appRoutePath(rel);
      if (!rp) continue;
      router = 'next-app';
      const { display, basis } = displayNameOf(indexes.get(rel));
      const idPath = rp.group ? `${rp.path === '/' ? '' : rp.path}/${rp.group}` : rp.path; // groups share URLs; ids must not
      const route = { id: `route:${idPath}${kind === 'layout' ? '#layout' : ''}`, path: rp.path, kind: kind === 'page' ? 'page' : 'layout', file: rel, group: rp.group, display: display || (kind === 'layout' ? `${rp.group || rp.path} layout` : null), displayBasis: basis, catalogLike: CATALOG_RE.test(rp.path) };
      routes.push(route);
      routeFiles.set(rel, route);
    } else if (nextProject && router !== 'next-app' && PAGES_FILE_RE.test(rel)) {
      const p = pagesRoutePath(rel);
      if (!p) continue;
      router = 'next-pages';
      const { display, basis } = displayNameOf(indexes.get(rel));
      const route = { id: `route:${p}`, path: p, kind: 'page', file: rel, group: null, display, displayBasis: basis, catalogLike: CATALOG_RE.test(p) };
      routes.push(route);
      routeFiles.set(rel, route);
    }
  }
  if (router === 'none') {
    // React Router: createBrowserRouter([{ path, element, children }]) objects and nested <Route> JSX.
    const found = reactRouterRoutes(indexes);
    if (found.length) {
      router = 'react-router';
      for (const r of found) {
        const idx = indexes.get(r.file);
        const { display, basis } = idx ? displayNameOf(idx) : { display: null, basis: null };
        const route = { id: `route:${r.path}${r.kind === 'layout' ? '#layout' : ''}`, path: r.path, kind: r.kind, file: r.file, group: null, display: display || (r.kind === 'layout' ? `${r.path} layout` : null), displayBasis: basis, catalogLike: CATALOG_RE.test(r.path), children: r.children };
        if (!routes.some((x) => x.id === route.id)) { routes.push(route); if (!routeFiles.has(r.file)) routeFiles.set(r.file, route); }
      }
    }
  }
  routes.sort((a, b) => (a.path === b.path ? (a.kind < b.kind ? -1 : 1) : a.path < b.path ? -1 : 1));
  return { router, routes, routeFiles };
}

const ROUTER_CREATORS = new Set(['createBrowserRouter', 'createHashRouter', 'createMemoryRouter', 'createStaticRouter']);

function joinPath(parent, child) {
  if (child == null) return parent || '/';
  if (child.startsWith('/')) return child.replace(/\/+$/, '') || '/';
  const base = (parent || '/').replace(/\/+$/, '');
  return (base + '/' + child).replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
}

/**
 * Walks every file for React Router route definitions and returns
 * [{ path, kind: 'page'|'layout', file, children: [route ids] }] with component files resolved through imports.
 */
function reactRouterRoutes(indexes) {
  const out = [];
  const fileOfComponent = (index, name) => {
    if (!name) return null;
    const local = name.split('.')[0];
    const imp = index.imports.find((i) => i.local === local);
    if (imp && index.project) { const r = index.project.resolve(index.rel, imp.spec); if (r && r.rel) return r.rel; }
    if (index.components.some((c) => c.name === local)) return index.rel;
    return null;
  };
  const componentOfJsxText = (text) => { const m = /^<\s*([A-Z][\w.]*)/.exec(String(text || '').trim()); return m ? m[1] : null; };
  const push = (entry) => { if (!out.some((o) => o.path === entry.path && o.kind === entry.kind)) out.push(entry); return entry; };
  for (const index of indexes.values()) {
    const { ts, sf } = index;
    if (!ts || !sf) continue;
    // object form
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ROUTER_CREATORS.has(node.expression.text) && node.arguments[0] && ts.isArrayLiteralExpression(node.arguments[0])) walkArray(node.arguments[0], '/');
      ts.forEachChild(node, visit);
    };
    const walkArray = (arr, parentPath) => {
      const ids = [];
      for (const el of arr.elements) {
        if (!ts.isObjectLiteralExpression(el)) continue;
        const props = new Map();
        for (const p of el.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) props.set(p.name.text, p.initializer);
        const pathNode = props.get('path');
        const pathStr = pathNode && (ts.isStringLiteral(pathNode) || ts.isNoSubstitutionTemplateLiteral(pathNode)) ? pathNode.text : null;
        const isIndex = props.has('index') && props.get('index').kind === ts.SyntaxKind.TrueKeyword;
        const full = isIndex ? (parentPath || '/') : joinPath(parentPath, pathStr);
        const elNode = props.get('element') || props.get('Component');
        const compName = elNode ? (ts.isJsxElement(elNode) || ts.isJsxSelfClosingElement(elNode) ? componentOfJsxText(elNode.getText(sf)) : ts.isIdentifier(elNode) ? elNode.text : null) : null;
        const file = fileOfComponent(index, compName);
        const children = props.get('children');
        if (children && ts.isArrayLiteralExpression(children)) {
          const kids = walkArray(children, full);
          if (file) push({ path: full, kind: 'layout', file, children: kids });
          ids.push(...kids);
        } else if (file) { const r = push({ path: full, kind: 'page', file, children: [] }); ids.push(`route:${r.path}`); }
      }
      return ids;
    };
    visit(sf);
    // JSX form: <Route path="/" element={<Shell/>}><Route index element={<Home/>}/></Route>
    const walkRouteJsx = (j, parentPath) => {
      const ids = [];
      for (const child of j.children || []) {
        if (child.tag !== 'Route') { ids.push(...walkRouteJsx(child, parentPath)); continue; }
        const pathAttr = child.attrs.path; const pathStr = pathAttr && pathAttr.kind === 'string' ? pathAttr.value : null;
        const isIndex = !!child.attrs.index;
        const full = isIndex ? (parentPath || '/') : joinPath(parentPath, pathStr);
        const el = child.attrs.element || child.attrs.Component;
        const compName = el ? (el.kind === 'string' ? el.value : componentOfJsxText(el.text) || (el.text || '').trim()) : null;
        const file = fileOfComponent(index, compName);
        const kids = walkRouteJsx(child, full);
        if (kids.length) { if (file) push({ path: full, kind: 'layout', file, children: kids }); ids.push(...kids); }
        else if (file) { const r = push({ path: full, kind: 'page', file, children: [] }); ids.push(`route:${r.path}`); }
      }
      return ids;
    };
    for (const j of index.jsx) if ((j.tag === 'Routes' || j.tag === 'BrowserRouter' || j.tag === 'HashRouter' || j.tag === 'Router') && j.children && j.children.length) walkRouteJsx(j, '/');
  }
  return out;
}

/** For every file, the set of routes that (transitively) import it. */
function attribute(indexes, routeFiles, resolve) {
  const importers = new Map(); // rel -> Set<rel>
  for (const index of indexes.values()) {
    for (const imp of index.imports) {
      if (imp.typeOnly) continue;
      const r = resolve(index.rel, imp.spec);
      if (r.kind !== 'local' || !r.rel) continue;
      if (!importers.has(r.rel)) importers.set(r.rel, new Set());
      importers.get(r.rel).add(index.rel);
    }
    for (const re of index.reexports) {
      const r = resolve(index.rel, re.spec);
      if (r.kind !== 'local' || !r.rel) continue;
      if (!importers.has(r.rel)) importers.set(r.rel, new Set());
      importers.get(r.rel).add(index.rel);
    }
  }
  // Pages rendered inside a layout: everything below the layout's directory.
  const layoutChildren = new Map();
  for (const [file, route] of routeFiles) {
    if (route.kind !== 'layout') continue;
    if (route.children && route.children.length) { layoutChildren.set(route.id, route.children); continue; } // React Router: explicit nesting
    const dir = path.posix.dirname(file) + '/';
    const kids = [...routeFiles.values()].filter((r) => r.kind === 'page' && (r.file.startsWith(dir) || path.posix.dirname(r.file) + '/' === dir)).map((r) => r.id);
    layoutChildren.set(route.id, kids);
  }
  const fileRoutes = new Map();
  for (const rel of indexes.keys()) {
    const found = new Set();
    const layouts = new Set();
    const seen = new Set([rel]);
    let frontier = [rel];
    let depth = 0;
    while (frontier.length && depth <= MAX_IMPORT_DEPTH) {
      const next = [];
      for (const f of frontier) {
        const route = routeFiles.get(f);
        if (route) { if (route.kind === 'layout') layouts.add(route.id); else found.add(route.id); continue; } // stop at a route file
        for (const imp of importers.get(f) || []) if (!seen.has(imp)) { seen.add(imp); next.push(imp); }
      }
      frontier = next;
      depth++;
    }
    const own = routeFiles.get(rel);
    const reachability = (found.size || layouts.size || own) ? 'reached' : (routeFiles.size ? 'unreached' : 'no-router');
    // A file reached through a layout is visible on every page under that layout.
    for (const l of layouts) for (const kid of layoutChildren.get(l) || []) found.add(kid);
    fileRoutes.set(rel, { routes: [...found].sort(), layouts: [...layouts].sort(), reachability });
  }
  return { fileRoutes, importers, layoutChildren };
}

module.exports = { discover, attribute, appRoutePath, pagesRoutePath, CATALOG_RE, MAX_IMPORT_DEPTH };
