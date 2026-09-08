/**
 * Tiny promise cache with a TTL and in-flight dedupe: concurrent callers of
 * the same key share one underlying call (the report hub opens several panes
 * at once, and without this they race each other into Boulevard's rate-limit
 * backoff). Rejections are evicted so errors never stick.
 */
export function ttlCache<T>(opts: {
	ttlMs: number
	/** Return false to evict a resolved value instead of caching it. */
	shouldCache?: (value: T) => boolean
	maxEntries?: number
}) {
	const { ttlMs, shouldCache, maxEntries = 100 } = opts
	const store = new Map<string, { at: number; value: Promise<T> }>()
	return (key: string, make: () => Promise<T>): Promise<T> => {
		const hit = store.get(key)
		if (hit && Date.now() - hit.at < ttlMs) return hit.value
		const value = make().then(
			resolved => {
				if (shouldCache && !shouldCache(resolved)) store.delete(key)
				return resolved
			},
			error => {
				store.delete(key)
				throw error
			},
		)
		if (store.size >= maxEntries) {
			for (const [k, v] of store)
				if (Date.now() - v.at >= ttlMs) store.delete(k)
			if (store.size >= maxEntries) store.clear()
		}
		store.set(key, { at: Date.now(), value })
		return value
	}
}
