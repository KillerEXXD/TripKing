/**
 * Bug context registry — pages/features that want extra debug context in
 * every bug report register a getter under a key. `getBugContext()` walks
 * the registry on submit, calls each getter, and returns a snapshot.
 */

export type BugContextGetter = () => unknown;

const registry = new Map<string, BugContextGetter>();

export function registerBugContext(key: string, getter: BugContextGetter): () => void {
  registry.set(key, getter);
  return () => {
    registry.delete(key);
  };
}

export function getBugContext(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, getter] of registry.entries()) {
    try {
      out[key] = getter();
    } catch (err) {
      out[key] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return out;
}

export function __clearBugContextForTests(): void {
  registry.clear();
}
