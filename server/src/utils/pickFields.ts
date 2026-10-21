/**
 * The listed fields of a request body, and nothing else. Update handlers pass this to `.update()`
 * instead of the raw body, so a client can't set columns it shouldn't (`is_default`, `id`, ...).
 */
export const pickFields = (body: unknown, allowed: readonly string[]): Record<string, unknown> => {
  const source = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  return Object.fromEntries(allowed.filter(field => source[field] !== undefined).map(field => [field, source[field]]));
};
