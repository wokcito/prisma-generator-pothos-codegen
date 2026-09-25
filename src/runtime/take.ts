/**
 * Clamps `take` to `max`, keeping its sign: a negative `take` paginates backwards, and it is capped too.
 * Without `take` the cap is the default.
 */
export const clampTake = (take: number | null | undefined, max: number): number =>
  take == null ? max : Math.max(-max, Math.min(max, take))
