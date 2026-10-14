// Model Next's shared data cache: function source + keyParts + arguments.
// A rejected loader never creates a cached value.
const values = new Map<string, unknown>();
export function clearNextCache() { values.clear(); }
export function unstable_cache<T extends (...args: never[]) => Promise<unknown>>(fn: T, keyParts: string[] = []) {
  return async (...args: Parameters<T>) => {
    const key = JSON.stringify([fn.toString(), keyParts, args]);
    if (values.has(key)) return values.get(key);
    const value = await fn(...args);
    values.set(key, value);
    return value;
  };
}
