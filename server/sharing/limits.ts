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
  /** Presence reports (which page a guest is on) per guest: 20 a minute, bursts of 10. */
  presence: { capacity: 10, per: 60_000, refill: 20 },
  /** Design saves (the drawing, its text) per guest: 30 a minute, bursts of 20. Autosave stays well under. */
  designSaves: { capacity: 20, per: 60_000, refill: 30 },
  /** New designs per guest and per link, a day. */
  designsPerGuestPerDay: 20,
  designsPerLinkPerDay: 100,
  /** Bytes of drawings and pictures a guest may send in a day. */
  designBytesPerGuestPerDay: 200 * 1024 * 1024,
  /** Changes to a data sheet's cells per guest (ADR-0010): 60 a minute, bursts of 30; then a day's caps. */
  sheetEdits: { capacity: 30, per: 60_000, refill: 60 },
  sheetEditsPerGuestPerDay: 1000,
  sheetEditsPerLinkPerDay: 3000,
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

/** Amounts (bytes) per key within `span` milliseconds, at most `max`. */
export class Budgets {
  private readonly spent = new Map<string, { at: number; n: number }[]>();
  private readonly max: number;
  private readonly span: number;
  constructor(max: number, span: number) {
    this.max = max;
    this.span = span;
  }

  private recent(key: string, now: number) {
    const kept = (this.spent.get(key) ?? []).filter((e) => now - e.at < this.span);
    if (kept.length) this.spent.set(key, kept);
    else this.spent.delete(key);
    return kept;
  }

  /** Spends `n` when it fits; false (spending nothing) when it doesn't. */
  spend(key: string, n: number, now: number): boolean {
    const kept = this.recent(key, now);
    if (kept.reduce((sum, e) => sum + e.n, 0) + n > this.max) return false;
    kept.push({ at: now, n });
    this.spent.set(key, kept);
    return true;
  }

  prune(now: number) {
    for (const key of [...this.spent.keys()]) this.recent(key, now);
  }
}

/** The limits of one share link. Keys are guest ids and client addresses. */
export function createLinkLimits() {
  const reads = new Buckets(LIMITS.reads);
  const writes = new Buckets(LIMITS.writes);
  const joins = new Buckets(LIMITS.joins);
  const presence = new Buckets(LIMITS.presence);
  const designSaves = new Buckets(LIMITS.designSaves);
  const designs = new Windows(LIMITS.designsPerGuestPerDay, DAY);
  const linkDesigns = new Windows(LIMITS.designsPerLinkPerDay, DAY);
  const designBytes = new Budgets(LIMITS.designBytesPerGuestPerDay, DAY);
  const daily = new Windows(LIMITS.writesPerGuestPerDay, DAY);
  const linkDaily = new Windows(LIMITS.writesPerLinkPerDay, DAY);
  const strikes = new Windows(Number.POSITIVE_INFINITY, LIMITS.strikeWindow);
  const sheetEdits = new Buckets(LIMITS.sheetEdits);
  const sheetDaily = new Windows(LIMITS.sheetEditsPerGuestPerDay, DAY);
  const sheetLinkDaily = new Windows(LIMITS.sheetEditsPerLinkPerDay, DAY);
  return {
    read: (ip: string, now: number) => reads.take(ip, now),
    join: (ip: string, now: number) => joins.take(ip, now),
    presence: (guest: string, now: number) => presence.take(guest, now),
    /** A design saved (its drawing or text): ms to wait, 0 when it may go. */
    designSave: (guest: string, now: number) => designSaves.take(guest, now),
    /** A new design: ms to wait for the day's caps, 0 when it may go (and it's counted). */
    designCreate: (guest: string, now: number) => {
      const wait = Math.max(designs.wait(guest, now), linkDesigns.wait("link", now));
      if (!wait) {
        designs.count(guest, now);
        linkDesigns.count("link", now);
      }
      return wait;
    },
    /** Bytes of drawings and pictures: false when the guest's day is spent. */
    designBytes: (guest: string, bytes: number, now: number) => designBytes.spend(guest, bytes, now),
    /** The per-day caps first, then the per-minute rate; a refused write uses up nothing. */
    write: (guest: string, now: number) => {
      const wait = Math.max(daily.wait(guest, now), linkDaily.wait("link", now)) || writes.take(guest, now);
      if (!wait) {
        daily.count(guest, now);
        linkDaily.count("link", now);
      }
      return wait;
    },
    /** A change to a sheet's cell: the day's caps, then the rate; a refused change uses up nothing. */
    sheetEdit: (guest: string, now: number) => {
      const wait =
        Math.max(sheetDaily.wait(guest, now), sheetLinkDaily.wait("link", now)) || sheetEdits.take(guest, now);
      if (!wait) {
        sheetDaily.count(guest, now);
        sheetLinkDaily.count("link", now);
      }
      return wait;
    },
    /** Counts a 429 against a key; true when the key has now struck out. */
    strike: (key: string, now: number) => strikes.count(key, now) >= LIMITS.strikes,
    prune: (now: number) => {
      for (const l of [
        reads,
        writes,
        joins,
        presence,
        designSaves,
        daily,
        linkDaily,
        strikes,
        designs,
        linkDesigns,
        sheetEdits,
        sheetDaily,
        sheetLinkDaily,
      ])
        l.prune(now);
      designBytes.prune(now);
    },
  };
}
export type LinkLimits = ReturnType<typeof createLinkLimits>;
