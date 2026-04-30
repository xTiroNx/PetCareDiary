import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../api/client";

type PaginatedResponse<T> = {
  items: T[];
  nextOffset: number | null;
};

function separator(path: string) {
  return path.includes("?") ? "&" : "?";
}

function normalizePage<T>(value: T[] | PaginatedResponse<T>): PaginatedResponse<T> {
  return Array.isArray(value) ? { items: value, nextOffset: null } : value;
}

export function usePaginatedApi<T>(queryKey: readonly unknown[], path: string, enabled: boolean, limit = 20) {
  const query = useInfiniteQuery({
    queryKey: [...queryKey, "paginated", limit],
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = await api<T[] | PaginatedResponse<T>>(`${path}${separator(path)}limit=${limit}&offset=${pageParam}`);
      return normalizePage(page);
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined
  });

  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    totalLoaded: query.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0
  };
}

