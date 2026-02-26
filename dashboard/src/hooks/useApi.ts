import { useState, useEffect } from "react";

interface FetchState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

export function useApi<T>(url: string | null): FetchState<T> {
    const [state, setState] = useState<FetchState<T>>({
        data: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        if (!url) {
            setState({ data: null, loading: false, error: null });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        fetch(url)
            .then(async (res) => {
                if (cancelled) return;
                if (!res.ok) {
                    if (res.status === 404) {
                        setState({ data: null, loading: false, error: null });
                        return;
                    }
                    throw new Error(`HTTP ${res.status}`);
                }
                const data = await res.json();
                setState({ data, loading: false, error: null });
            })
            .catch((err) => {
                if (cancelled) return;
                setState({
                    data: null,
                    loading: false,
                    error: err.message,
                });
            });

        return () => {
            cancelled = true;
        };
    }, [url]);

    return state;
}
