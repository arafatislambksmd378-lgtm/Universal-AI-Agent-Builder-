import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest } from './api';

export interface QueryState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

/**
 * Minimal data-fetching hook: cancellable, re-runnable, and explicit about
 * loading vs. error so pages can show an honest empty state.
 */
export function useApiQuery<T>(path: string | null): QueryState<T> & { reload: () => void } {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    error: null,
    loading: Boolean(path),
  });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const data = await apiRequest<T>(path, { signal: controller.signal });
      if (!controller.signal.aborted) setState({ data, error: null, loading: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({
        data: null,
        error:
          error instanceof ApiError
            ? error
            : new ApiError(0, 'unknown', 'Something went wrong loading this data.'),
        loading: false,
      });
    }
  }, [path]);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return { ...state, reload: () => void load() };
}
