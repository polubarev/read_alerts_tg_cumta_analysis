"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildDashboardModel } from "@/lib/dashboard-data";
import { buildFilterSearchParams, defaultFilters, parseFilters } from "@/lib/filters";
import type { DashboardFilters, DashboardModel, DashboardSeed } from "@/lib/types";

interface DashboardContextValue {
  seed: DashboardSeed | null;
  model: DashboardModel | null;
  filters: DashboardFilters | null;
  loading: boolean;
  error: string | null;
  isNavigating: boolean;
  replaceFilters: (next: DashboardFilters) => void;
  resetFilters: () => void;
  toggleAlertType: (value: string) => void;
  selectAllAlertTypes: () => void;
  toggleDistrict: (value: string) => void;
  addArea: (value: string) => void;
  removeArea: (value: string) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [seed, setSeed] = useState<DashboardSeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let active = true;

    async function loadSeed() {
      setLoading(true);
      try {
        const response = await fetch("/data/dashboard_seed.json", {
          cache: "force-cache"
        });
        if (!response.ok) {
          throw new Error(`Failed to load dashboard seed (${response.status})`);
        }
        const payload = (await response.json()) as DashboardSeed;
        if (active) {
          setSeed(payload);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unknown dashboard data error");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSeed();

    return () => {
      active = false;
    };
  }, []);

  const filters = useMemo(() => {
    if (!seed) {
      return null;
    }
    return parseFilters(searchParams, seed);
  }, [searchParams, seed]);

  const model = useMemo(() => {
    if (!seed || !filters) {
      return null;
    }
    return buildDashboardModel(seed, filters);
  }, [filters, seed]);

  const replaceFilters = (next: DashboardFilters) => {
    if (!seed) {
      return;
    }

    const query = buildFilterSearchParams(next, seed);
    const href = query ? `${pathname}?${query}` : pathname;

    setIsNavigating(true);
    startTransition(() => {
      router.replace(href, { scroll: false });
      setTimeout(() => setIsNavigating(false), 120);
    });
  };

  const resetFilters = () => {
    if (!seed) {
      return;
    }
    replaceFilters(defaultFilters(seed));
  };

  const toggleAlertType = (value: string) => {
    if (!filters || !seed) {
      return;
    }
    const hasValue = filters.alert_types.includes(value);
    const nextAlertTypes = hasValue
      ? filters.alert_types.filter((item) => item !== value)
      : [...filters.alert_types, value];

    replaceFilters({
      ...filters,
      alert_types: nextAlertTypes.length > 0 ? nextAlertTypes : [...seed.metadata.default_alert_types]
    });
  };

  const selectAllAlertTypes = () => {
    if (!filters || !seed) {
      return;
    }
    replaceFilters({
      ...filters,
      alert_types: [...seed.filter_options.alert_types]
    });
  };

  const toggleDistrict = (value: string) => {
    if (!filters) {
      return;
    }
    const nextDistricts = filters.districts.includes(value)
      ? filters.districts.filter((item) => item !== value)
      : [...filters.districts, value];

    replaceFilters({
      ...filters,
      districts: nextDistricts
    });
  };

  const addArea = (value: string) => {
    if (!filters || !seed || !seed.filter_options.areas.includes(value) || filters.areas.includes(value)) {
      return;
    }
    replaceFilters({
      ...filters,
      areas: [...filters.areas, value]
    });
  };

  const removeArea = (value: string) => {
    if (!filters) {
      return;
    }
    replaceFilters({
      ...filters,
      areas: filters.areas.filter((item) => item !== value)
    });
  };

  const contextValue = useMemo<DashboardContextValue>(
    () => ({
      seed,
      model,
      filters,
      loading,
      error,
      isNavigating,
      replaceFilters,
      resetFilters,
      toggleAlertType,
      selectAllAlertTypes,
      toggleDistrict,
      addArea,
      removeArea
    }),
    [error, filters, isNavigating, loading, model, seed]
  );

  return <DashboardContext.Provider value={contextValue}>{children}</DashboardContext.Provider>;
}

export function useDashboardContext(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("Dashboard context is only available inside DashboardProvider.");
  }
  return context;
}
