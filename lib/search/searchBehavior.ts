export const SEARCH_DEBOUNCE_MS = 550;
export const MIN_SEARCH_QUERY_LENGTH = 3;

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

export function shouldRequestSearch(query: string): boolean {
  return normalizeSearchQuery(query).length >= MIN_SEARCH_QUERY_LENGTH;
}
