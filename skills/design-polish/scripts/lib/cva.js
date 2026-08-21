'use strict';
// Parses `cva(base, { variants, defaultVariants, compoundVariants })` into a model
// and applies a set of prop values to it. This is how shadcn/ui components express
// their looks, so every Button/Badge usage in an app expands through here.
const { evaluate, staticValue, emptySet, addTokens } = require('./class-eval');

function tokensOf(node, ctx, model) {
  if (!node) return [];
  const set = evaluate(node, ctx);
  if (model) Object.assign(model.origins, set.origins || {});
  return set.tokens;
}

function parseCva(callNode, ctx) {
  const { ts, sf } = ctx;
  const model = { base: [], variants: {}, defaults: {}, compound: [], file: ctx.index ? ctx.index.rel : null, origins: {} };
  const [baseNode, cfgNode] = callNode.arguments;
  model.base = tokensOf(baseNode, ctx, model);
  if (cfgNode && ts.isObjectLiteralExpression(cfgNode)) {
    for (const p of cfgNode.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const key = p.name.getText(sf);
      if (key === 'variants' && ts.isObjectLiteralExpression(p.initializer)) {
        for (const axisProp of p.initializer.properties) {
          if (!ts.isPropertyAssignment(axisProp) || !ts.isObjectLiteralExpression(axisProp.initializer)) continue;
          const axis = ts.isIdentifier(axisProp.name) || ts.isStringLiteral(axisProp.name) ? axisProp.name.text : axisProp.name.getText(sf);
          model.variants[axis] = {};
          for (const vp of axisProp.initializer.properties) {
            if (!ts.isPropertyAssignment(vp)) continue;
            const value = ts.isIdentifier(vp.name) || ts.isStringLiteral(vp.name) || ts.isNumericLiteral(vp.name) ? vp.name.text : vp.name.getText(sf);
            model.variants[axis][value] = tokensOf(vp.initializer, ctx, model);
          }
        }
      } else if (key === 'defaultVariants' && ts.isObjectLiteralExpression(p.initializer)) {
        for (const dp of p.initializer.properties) {
          if (!ts.isPropertyAssignment(dp)) continue;
          const axis = ts.isIdentifier(dp.name) || ts.isStringLiteral(dp.name) ? dp.name.text : dp.name.getText(sf);
          const v = staticValue(dp.initializer, ctx);
          if (v !== undefined) model.defaults[axis] = v;
        }
      } else if (key === 'compoundVariants' && ts.isArrayLiteralExpression(p.initializer)) {
        for (const el of p.initializer.elements) {
          if (!ts.isObjectLiteralExpression(el)) continue;
          const when = {};
          let tokens = [];
          for (const cp of el.properties) {
            if (!ts.isPropertyAssignment(cp)) continue;
            const k = ts.isIdentifier(cp.name) || ts.isStringLiteral(cp.name) ? cp.name.text : cp.name.getText(sf);
            if (k === 'class' || k === 'className') { tokens = tokensOf(cp.initializer, ctx, model); continue; }
            if (ts.isArrayLiteralExpression(cp.initializer)) when[k] = cp.initializer.elements.map((e) => staticValue(e, ctx)).filter((v) => v !== undefined);
            else { const v = staticValue(cp.initializer, ctx); if (v !== undefined) when[k] = v; }
          }
          model.compound.push({ when, tokens });
        }
      }
    }
  }
  return model;
}

function applyCva(model, env) {
  const set = emptySet();
  addTokens(set, model.base);
  const axesUsed = {};
  const inferred = [];
  for (const axis of Object.keys(model.variants)) {
    let v = env[axis];
    if (v === undefined || v === null) { v = model.defaults[axis]; if (v !== undefined) inferred.push(`${axis}=${v}`); }
    if (v === undefined || v === null) { axesUsed[axis] = null; continue; }
    axesUsed[axis] = v;
    const tokens = model.variants[axis][String(v)];
    if (tokens) addTokens(set, tokens);
  }
  for (const c of model.compound) {
    const ok = Object.entries(c.when).every(([axis, want]) => {
      const have = axesUsed[axis] !== undefined ? axesUsed[axis] : env[axis];
      return Array.isArray(want) ? want.some((w) => String(w) === String(have)) : String(want) === String(have);
    });
    if (ok) addTokens(set, c.tokens);
  }
  return { tokens: set.tokens, axesUsed, inferred, origins: model.origins || {} };
}

module.exports = { parseCva, applyCva };
