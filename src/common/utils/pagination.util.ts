import { PaginatedResponseDto } from '../dto/pagination.dto';

/**
 * Creates a paginated response from data and total count
 */
export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponseDto<T> {
  return new PaginatedResponseDto(data, total, page, limit);
}

/**
 * Returns skip/take values for Prisma queries
 */
export function getPaginationParams(page: number, limit: number): {
  skip: number;
  take: number;
} {
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}
