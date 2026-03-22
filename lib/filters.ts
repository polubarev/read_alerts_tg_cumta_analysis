import type { DashboardFilters, DashboardSeed } from "@/lib/types";

function normalizeArray(values: string[], options: string[]): string[] {
  const allowed = new Set(options);
  return values.filter((value, index) => allowed.has(value) && values.indexOf(value) === index);
}

function sameArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function defaultFilters(seed: DashboardSeed): DashboardFilters {
  return {
    date_from: seed.metadata.coverage_start.slice(0, 10),
    date_to: seed.metadata.coverage_end.slice(0, 10),
    alert_types: [...seed.metadata.default_alert_types],
    districts: [],
    areas: []
  };
}

export function parseFilters(
  params: URLSearchParams | { get: (name: string) => string | null; getAll: (name: string) => string[] },
  seed: DashboardSeed
): DashboardFilters {
  const defaults = defaultFilters(seed);
  const dateFrom = params.get("from") ?? defaults.date_from;
  const dateTo = params.get("to") ?? defaults.date_to;
  const alertTypes = normalizeArray(
    params.getAll("alert_type"),
    seed.filter_options.alert_types
  );
  const districts = normalizeArray(params.getAll("district"), seed.filter_options.districts);
  const areas = normalizeArray(params.getAll("area"), seed.filter_options.areas);

  return {
    date_from: dateFrom,
    date_to: dateTo,
    alert_types: alertTypes.length > 0 ? alertTypes : defaults.alert_types,
    districts,
    areas
  };
}

export function buildFilterSearchParams(filters: DashboardFilters, seed: DashboardSeed): string {
  const defaults = defaultFilters(seed);
  const params = new URLSearchParams();

  if (filters.date_from !== defaults.date_from) {
    params.set("from", filters.date_from);
  }
  if (filters.date_to !== defaults.date_to) {
    params.set("to", filters.date_to);
  }
  if (!sameArray(filters.alert_types, defaults.alert_types)) {
    for (const value of filters.alert_types) {
      params.append("alert_type", value);
    }
  }
  for (const district of filters.districts) {
    params.append("district", district);
  }
  for (const area of filters.areas) {
    params.append("area", area);
  }

  return params.toString();
}
