'use strict';
// Stable identifiers. Everything downstream (curation, apply, before/after diff)
// references these IDs, so they must not depend on line numbers or file order.
const crypto = require('crypto');

// 12 hex chars = 48 bits. Collisions inside one repo (thousands of items) are
// astronomically unlikely, and short IDs keep JSON and URLs readable.
const HASH_LEN = 12;

function hash(input, len = HASH_LEN) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, len);
}

// Signature id: type + hash of the canonical declaration key (spelling-independent).
function sigId(type, declKey) {
  return `sig:${type}:${hash(declKey)}`;
}

// Occurrence id: anchored on file + owning component + JSX path, not on line numbers,
// so an unrelated edit above the element does not change the id.
function occId(file, component, jsxPath) {
  return `occ:${hash(`${file}|${component || ''}|${jsxPath}`)}`;
}

// Token ids are the normalized value itself (readable in the report and in decisions).
function tokId(axis, normalizedValue) {
  return `tok:${axis}:${normalizedValue}`;
}
function declaredTokId(axis, varName) {
  return `tok:${axis}:var:${varName}`;
}
function proposedTokId(axis, name) {
  return `tok+:${axis}.${name}`;
}
function findingId(rule, subjectIds) {
  return `F:${rule}:${hash([...subjectIds].sort().join('|'), 6)}`;
}
function clusterId(axis, memberIds) {
  return `cl:${axis}:${hash([...memberIds].sort().join('|'), 8)}`;
}
function groupId(file, line) {
  return `grp:${hash(`${file}:${line}`, 10)}`;
}
function implId(type, file, name) {
  return `impl:${type}:${file}${name ? '#' + name : ''}`;
}
function routeId(path) {
  return `route:${path}`;
}

module.exports = { hash, sigId, occId, tokId, declaredTokId, proposedTokId, findingId, clusterId, groupId, implId, routeId, HASH_LEN };
