/**
 * Stable deep-equal for plain JSON-serializable values.
 *
 * Used by Saved-Views (`currentConfigIsDirty`) where naive
 * `JSON.stringify(a) !== JSON.stringify(b)` can flag false positives
 * because object-key-order is not guaranteed when values are mutated.
 *
 * Scope: only objects, arrays, primitives, and `null`. Doesn't handle
 * Date, Map, Set, or custom classes — those don't appear in our view-configs.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(b)) return false;

  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  for (const key of ka) {
    if (!Object.prototype.hasOwnProperty.call(bo, key)) return false;
    if (!deepEqual(ao[key], bo[key])) return false;
  }
  return true;
}
