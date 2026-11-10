export interface Measures {
  entries: number;
  views: number;
  exposureMs: number;
  quickSkips: number;
  likes: number;
  comments: number;
}

export const NO_MEASURES: Measures = {
  entries: 0,
  views: 0,
  exposureMs: 0,
  quickSkips: 0,
  likes: 0,
  comments: 0,
};

export function addMeasures(a: Measures, b: Partial<Measures>): Measures {
  return {
    entries: a.entries + (b.entries ?? 0),
    views: a.views + (b.views ?? 0),
    exposureMs: a.exposureMs + (b.exposureMs ?? 0),
    quickSkips: a.quickSkips + (b.quickSkips ?? 0),
    likes: a.likes + (b.likes ?? 0),
    comments: a.comments + (b.comments ?? 0),
  };
}

/**
 * Rates as a sum over a sum, never an average of averages (the demo's rule). With no
 * denominator the rate is null: the dashboard shows "—", never 0.
 */
export function ratesOf(measures: Measures): {
  exposureAverageMs: number | null;
  quickSkipRate: number | null;
} {
  return {
    exposureAverageMs:
      measures.views > 0 ? measures.exposureMs / measures.views : null,
    quickSkipRate:
      measures.entries > 0 ? measures.quickSkips / measures.entries : null,
  };
}
