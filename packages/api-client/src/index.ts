export type { HttpRequest, HttpResponse, Transport } from "./transport.ts";
export {
  ApiError,
  errorCodeOf,
  isNotFound,
  isTemporary,
  type ApiFailure,
} from "./api-error.ts";
export {
  createDinerApi,
  type DinerApi,
  type DinerApiOptions,
} from "./diner-api.ts";
