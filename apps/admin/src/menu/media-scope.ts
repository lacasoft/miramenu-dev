import type { AdminApi } from "@miramenu/api-client";
import type {
  CreatedMedia,
  CreateMediaRequest,
  Media,
} from "@miramenu/contracts";
import type { QueryKey } from "@tanstack/react-query";
import { keys } from "../app/keys";

/**
 * Where a slot's media live (ADR-0038): the business uploads under its route and each
 * branch under its own. An upload reads again the draft that names it and the problems.
 */
export interface MediaScope {
  draftKey: QueryKey;
  problemsKey: QueryKey;
  create: (api: AdminApi, request: CreateMediaRequest) => Promise<CreatedMedia>;
  complete: (api: AdminApi, mediaId: string) => Promise<Media>;
}

export const businessMedia = (businessId: string): MediaScope => ({
  draftKey: keys.menuDraft(businessId),
  problemsKey: keys.mediaProblems(businessId),
  create: (api, request) => api.createMedia(businessId, request),
  complete: (api, mediaId) => api.completeMedia(businessId, mediaId),
});

export const branchMedia = (branchId: string): MediaScope => ({
  draftKey: keys.branchMenuDraft(branchId),
  problemsKey: keys.branchMediaProblems(branchId),
  create: (api, request) => api.createBranchMedia(branchId, request),
  complete: (api, mediaId) => api.completeBranchMedia(branchId, mediaId),
});
