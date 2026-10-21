// The guest server's abuse limits (ADR-0003). Token buckets for per-minute and per-hour rates, sliding windows for
// daily caps and for counting how often someone hit a limit. All of it lives in memory with the share link.

export const LIMITS = {
  /** Active share links at a time. */
  links: 10,
  /** Guests (display names) per link. */
  guests: 200,
  /** Requests per client address: 120 a minute, bursts of 40. */
  reads: { capacity: 40, per: 60_000, refill: 120 },
  /** Comments, replies, answers and status changes per guest. */
  writes: { capacity: 6, per: 60_000, refill: 6 },
  writesPerGuestPerDay: 60,
  writesPerLinkPerDay: 300,
  /** New guest names per client address. */
  joins: { capacity: 10, per: 3_600_000, refill: 10 },
  /** This many 429s within `strikeWindow` blocks the guest and their address for the rest of the link's life. */
  strikes: 5,
  strikeWindow: 10 * 60_000,
  /** Seconds a guest's request for changes may wait for one (long polling). */
  longPoll: 25,
  /** Bytes of a comment, reply or answer; bytes of a request; characters of a quote and of its context. */
  comment: 4096,
  request: 16_384,
  quote: 4000,
  context: 200,
} as const;

const DAY = 86_400_000;

export interface Rate {
  capacity: number;
  /** `refill` tokens come back every `per` milliseconds. */
  per: number;
  refill: number;
}

/** Token buckets by key. `take` answers how many milliseconds to wait, 0 when the request may go. */
export class Buckets {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private readonly rate: Rate;
  constructor(rate: Rate) {
    this.rate = rate;
  }

  take(key: string, now: number): number {
    const { capacity, per, refill } = this.rate;
    const b = this.buckets.get(key) ?? { tokens: capacity, at: now };
    b.tokens = Math.min(capacity, b.tokens + ((now - b.at) * refill) / per);
    b.at = now;
    this.buckets.set(key, b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - b.tokens) * per) / refill);
  }

  /** Forget buckets that have filled up again. */
  prune(now: number) {
    const { capacity, per, refill } = this.rate;
    for (const [key, b] of this.buckets)
      if (b.tokens + ((now - b.at) * refill) / per >= capacity) this.buckets.delete(key);
  }
}

/** At most `max` events per key within `span` milliseconds. */
export class Windows {
  private readonly events = new Map<string, number[]>();
  private readonly max: number;
  private readonly span: number;
  constructor(max: number, span: number) {
    this.max = max;
    this.span = span;
  }

  private recent(key: string, now: number): number[] {
    const kept = (this.events.get(key) ?? []).filter((t) => now - t < this.span);
    if (kept.length) this.events.set(key, kept);
    else this.events.delete(key);
    return kept;
  }

  /** How many milliseconds until there's room for one more event: 0 when there is. Records nothing. */
  wait(key: string, now: number): number {
    const kept = this.recent(key, now);
    return kept.length >= this.max ? kept[0] + this.span - now : 0;
  }

  /** Records an event and answers how many there are now in the window. */
  count(key: string, now: number): number {
    const kept = this.recent(key, now);
    kept.push(now);
    this.events.set(key, kept);
    return kept.length;
  }

  prune(now: number) {
    for (const key of [...this.events.keys()]) this.recent(key, now);
  }
}

/** The limits of one share link. Keys are guest ids and client addresses. */
export function createLinkLimits() {
  const reads = new Buckets(LIMITS.reads);
  const writes = new Buckets(LIMITS.writes);
  const joins = new Buckets(LIMITS.joins);
  const daily = new Windows(LIMITS.writesPerGuestPerDay, DAY);
  const linkDaily = new Windows(LIMITS.writesPerLinkPerDay, DAY);
  const strikes = new Windows(Number.POSITIVE_INFINITY, LIMITS.strikeWindow);
  return {
    read: (ip: string, now: number) => reads.take(ip, now),
    join: (ip: string, now: number) => joins.take(ip, now),
    /** The per-day caps first, then the per-minute rate; a refused write uses up nothing. */
    write: (guest: string, now: number) => {
      const wait = Math.max(daily.wait(guest, now), linkDaily.wait("link", now)) || writes.take(guest, now);
      if (!wait) {
        daily.count(guest, now);
        linkDaily.count("link", now);
      }
      return wait;
    },
    /** Counts a 429 against a key; true when the key has now struck out. */
    strike: (key: string, now: number) => strikes.count(key, now) >= LIMITS.strikes,
    prune: (now: number) => {
      for (const l of [reads, writes, joins, daily, linkDaily, strikes]) l.prune(now);
    },
  };
}
export type LinkLimits = ReturnType<typeof createLinkLimits>;
