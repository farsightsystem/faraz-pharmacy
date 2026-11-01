export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function getPaginationParams(
  page: unknown,
  limit: unknown,
  paginated: boolean
): { page: number; limit: number } {
  return {
    page: parsePositiveInteger(page) ?? 1,
    limit: Math.min(
      MAX_PAGE_SIZE,
      parsePositiveInteger(limit) ?? (paginated ? DEFAULT_PAGE_SIZE : MAX_PAGE_SIZE)
    ),
  };
}

export function clampPageSize(limit: number | undefined): number {
  if (!Number.isSafeInteger(limit) || (limit ?? 0) <= 0) return MAX_PAGE_SIZE;
  return Math.min(limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
}
