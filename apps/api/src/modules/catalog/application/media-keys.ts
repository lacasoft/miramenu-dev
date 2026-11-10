/**
 * Object keys of a medium (ADR-0038): its original in the private area and its variants in
 * the public one, all under business and medium ids, so a key is never reused.
 */
export const originalKey = (businessId: string, mediaId: string) =>
  `${businessId}/${mediaId}/original`;

export const variantKey = (businessId: string, mediaId: string, file: string) =>
  `${businessId}/${mediaId}/${file}`;
