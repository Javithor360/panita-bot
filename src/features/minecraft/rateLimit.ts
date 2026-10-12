/**
 * A sliding-window limit per key: at most `limit` things in any `windowMs`. In memory only, which is all a limit on chat needs.
 */
export class RateLimiter {
  private readonly taken = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one thing for the key and says whether it is allowed. A refused one is not counted. */
  take(key: string): boolean {
    const now = this.now();
    const recent = (this.taken.get(key) ?? []).filter(at => now - at < this.windowMs);
    if (recent.length >= this.limit) {
      this.taken.set(key, recent);
      return false;
    }
    recent.push(now);
    this.taken.set(key, recent);
    return true;
  }
}
