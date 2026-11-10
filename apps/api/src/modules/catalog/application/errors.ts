import { CATALOG_ERROR_CODES, GENERIC_ERROR_CODES } from '@miramenu/contracts';
import { ApiException } from '../../../infrastructure/http/api-exception';

export const notFound = () =>
  new ApiException(404, GENERIC_ERROR_CODES.NOT_FOUND, 'Not found');

export const categoryNotFound = () =>
  new ApiException(
    404,
    CATALOG_ERROR_CODES.CATEGORY_NOT_FOUND,
    'The category does not exist in this business',
  );

export const conflict = (
  code: (typeof CATALOG_ERROR_CODES)[keyof typeof CATALOG_ERROR_CODES],
  message: string,
) => new ApiException(409, code, message);

export const menuUnavailable = () =>
  new ApiException(
    503,
    GENERIC_ERROR_CODES.SERVICE_UNAVAILABLE,
    'Menu unavailable',
  );
