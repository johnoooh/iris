import { useInfiniteQuery } from '@tanstack/react-query'
import { buildQuery, parseTrials } from '../utils/apiHelpers'

async function fetchTrials({ searchParams, coords, pageToken }) {
  const url = buildQuery(searchParams, coords, pageToken)
  const res = await fetch(url)
  if (res.status === 429) throw new Error('RATE_LIMITED')
  if (!res.ok) throw new Error('API_ERROR')
  const data = await res.json()
  return {
    trials: parseTrials(data.studies ?? []),
    nextPageToken: data.nextPageToken ?? null,
    totalCount: data.totalCount ?? 0,
  }
}

export function useClinicalTrials(searchParams, coords, disabled = false) {
  return useInfiniteQuery({
    queryKey: ['trials', searchParams, coords],
    queryFn: ({ pageParam }) =>
      fetchTrials({ searchParams, coords, pageToken: pageParam }),
    getNextPageParam: lastPage => lastPage.nextPageToken ?? undefined,
    initialPageParam: undefined,
    enabled: Boolean(searchParams?.condition) && !disabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
  })
}
