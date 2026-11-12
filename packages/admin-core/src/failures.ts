/** A failed call as the API client reports it; only what the flows need. */
export interface CallFailure {
  kind: string;
  status?: number;
  code?: string;
  retryAfterSeconds?: number;
}
