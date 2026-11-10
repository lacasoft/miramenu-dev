import { z } from "zod";

/** Limits of a feed entry and of a batch (ADR-0041; design: 7 días tarde). */
export const FEED_ENTRY_LIMITS = {
  entriesPerBatch: 100,
  /** Older entries are discarded (design supuesto: 7 days late). */
  lateDays: 7,
  /** Clock skew tolerated for entries that claim to happen in the future. */
  futureMs: 5 * 60 * 1000,
  maxExposureMs: 10 * 60 * 1000,
  /** A valid view is 70% of the card visible for 1 s continuous (the demo's definition). */
  validViewMs: 1000,
  /** A manual skip with less exposure than this is a quick skip. */
  quickSkipMs: 2000,
} as const;

/**
 * How the entry ended. manual: the diner swiped on. auto: the feed advanced by itself.
 * abandoned: the page was hidden (lock, app switch or close; ADR-0011).
 */
export const feedExitSchema = z.enum(["manual", "auto", "abandoned"]);

/**
 * One entry to a dish's card in the feed, sent once it closes (ADR-0041): what the
 * design measured with ~6 events, in one immutable record. Only the feed counts: the grid
 * shows several dishes at once (design).
 */
export const feedEntrySchema = z
  .strictObject({
    /** Chosen by the PWA; a resent entry keeps it, so it is counted once. */
    entryId: z.uuid(),
    branchId: z.uuid(),
    dishId: z.uuid(),
    enteredAt: z.iso.datetime({ offset: true }),
    exposureMs: z.number().int().min(0).max(FEED_ENTRY_LIMITS.maxExposureMs),
    validView: z.boolean(),
    exit: feedExitSchema,
  })
  .refine(
    (entry) =>
      !entry.validView || entry.exposureMs >= FEED_ENTRY_LIMITS.validViewMs,
    { message: "a valid view needs 1 s of exposure", path: ["validView"] },
  );

/**
 * A batch from one device. sendBeacon cannot set headers, so the device id travels in
 * the body; each entry is checked on its own and answered in the receipt.
 */
export const feedEntryBatchSchema = z.strictObject({
  deviceId: z.uuid(),
  entries: z.array(z.unknown()).min(1).max(FEED_ENTRY_LIMITS.entriesPerBatch),
});

export const entryRejectionSchema = z.enum([
  "invalid",
  "too_late",
  "in_future",
  "repeated_in_batch",
]);

/** Per entry (design: "responde por evento"); both lists are final for the PWA. */
export const batchReceiptSchema = z.strictObject({
  accepted: z.array(z.uuid()),
  rejected: z.array(
    z.strictObject({
      /** Position in the batch, since an invalid entry may have no usable id. */
      index: z.number().int().nonnegative(),
      entryId: z.uuid().nullable(),
      reason: entryRejectionSchema,
    }),
  ),
});

const isTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const HOUR_MS = 60 * 60 * 1000;
export const METRICS_MAX_DAYS = 400;

const hourInstant = z.iso
  .datetime({ offset: true })
  .refine((value) => new Date(value).getTime() % HOUR_MS === 0, "whole hours");

/** A period of whole hours (aggregates are hourly), up to 400 days, read in a time zone. */
export const metricsQuerySchema = z
  .strictObject({
    from: hourInstant,
    to: hourInstant,
    timeZone: z
      .string()
      .refine(isTimeZone, "unknown time zone")
      .default("America/Mexico_City"),
  })
  .refine(
    ({ from, to }) => {
      const span = new Date(to).getTime() - new Date(from).getTime();
      return span > 0 && span <= METRICS_MAX_DAYS * 24 * HOUR_MS;
    },
    { message: "to must follow from, within 400 days", path: ["to"] },
  );

const count = z.number().int().nonnegative();

const measuresSchema = z.strictObject({
  entries: count,
  views: count,
  /** Exposure of the entries that reached a valid view (the demo's definition). */
  exposureMs: count,
  quickSkips: count,
  likes: count,
  comments: count,
});

/** Rates as sum over sum; null when there is nothing to divide by (never shown as 0). */
const ratesSchema = z.strictObject({
  exposureAverageMs: z.number().nonnegative().nullable(),
  quickSkipRate: z.number().min(0).max(1).nullable(),
});

export const metricsSchema = z.strictObject({
  period: z.strictObject({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    timeZone: z.string(),
  }),
  totals: measuresSchema.extend(ratesSchema.shape),
  /** Days in the requested time zone, oldest first; only days with activity. */
  byDay: z.array(measuresSchema.extend({ day: z.iso.date() })),
  /** Every dish with activity in the period. */
  byDish: z.array(
    measuresSchema.extend(ratesSchema.shape).extend({ dishId: z.uuid() }),
  ),
});

export type FeedEntry = z.infer<typeof feedEntrySchema>;
export type FeedExit = z.infer<typeof feedExitSchema>;
export type BatchReceipt = z.infer<typeof batchReceiptSchema>;
export type EntryRejection = z.infer<typeof entryRejectionSchema>;
export type MetricsQuery = z.output<typeof metricsQuerySchema>;
export type Metrics = z.infer<typeof metricsSchema>;

/** Error codes of the Measurement context, besides the generic ones. */
export const MEASUREMENT_ERROR_CODES = {
  /** The queue passed its cap (e.g. Postgres is down): keep the batch and retry later. */
  MEASUREMENT_QUEUE_FULL: "MEASUREMENT_QUEUE_FULL",
  /** Redis did not answer: keep the batch and retry later. */
  MEASUREMENT_UNAVAILABLE: "MEASUREMENT_UNAVAILABLE",
} as const;
