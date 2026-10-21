// Ids that never collide between PCs (ADR-0003, phase 3): ULIDs, 26 characters of Crockford base32, the first ten
// the time in milliseconds (so they sort by age) and the rest random.
import { randomBytes } from "node:crypto";

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newUid(now = Date.now()): string {
  let time = "";
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = B32[t % 32] + time;
  let random = "";
  for (const byte of randomBytes(16)) random += B32[byte % 32];
  return time + random;
}
