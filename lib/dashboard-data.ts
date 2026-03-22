import { dayKey, enumerateDates, formatHourValue, hourKey, timeToDecimal, weekdayIndex, weekdayLabel } from "@/lib/date";
import type {
  AlertOccurrence,
  DashboardFilters,
  DashboardModel,
  DashboardSeed,
  DailyCountPoint,
  EventBurst,
  MapPoint,
  ParseIssue,
  RankingItem
} from "@/lib/types";

function share(count: number, total: number): number {
  return total > 0 ? Number((count / total).toFixed(4)) : 0;
}

function eventBurstsFromOccurrences(filtered: AlertOccurrence[]): EventBurst[] {
  const grouped = new Map<string, AlertOccurrence[]>();
  for (const row of filtered) {
    const bucket = grouped.get(row.alarm_time);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(row.alarm_time, [row]);
    }
  }

  const bursts: EventBurst[] = [];
  for (const [alarmTime, rows] of grouped.entries()) {
    const areas = [...new Set(rows.map((row) => row.area))].sort();
    const districts = [...new Set(rows.map((row) => row.district))].sort();
    const alertTypes = [...new Set(rows.map((row) => row.alert_type))].sort();
    const sourceIds = [...new Set(rows.flatMap((row) => row.source_message_ids))].sort((a, b) => a - b);

    bursts.push({
      alarm_time: alarmTime,
      burst_size: new Set(rows.map((row) => `${row.area}|${row.district}`)).size,
      total_occurrences: rows.length,
      districts,
      areas,
      alert_types: alertTypes,
      source_message_ids: sourceIds
    });
  }

  return bursts.sort((left, right) => {
    if (right.burst_size !== left.burst_size) {
      return right.burst_size - left.burst_size;
    }
    return left.alarm_time.localeCompare(right.alarm_time);
  });
}

function rankingsFromMap(counter: Map<string, { count: number; area?: string; district?: string }>, total: number, limit: number): RankingItem[] {
  return [...counter.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, value]) => ({
      key,
      label: key,
      count: value.count,
      share: share(value.count, total),
      area: value.area,
      district: value.district
    }));
}

function rollingAverage(values: number[], window = 7): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const windowValues = values.slice(start, index + 1);
    return Number((windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length).toFixed(2));
  });
}

function filterIssues(issues: ParseIssue[], filters: DashboardFilters): ParseIssue[] {
  return issues.filter((issue) => {
    const date = issue.message_date.slice(0, 10);
    return date >= filters.date_from && date <= filters.date_to;
  });
}

export function buildDashboardModel(seed: DashboardSeed, filters: DashboardFilters): DashboardModel {
  const startStamp = `${filters.date_from}T00:00:00`;
  const endStamp = `${filters.date_to}T23:59:59`;
  const selectedAlertTypes = new Set(filters.alert_types);
  const selectedDistricts = new Set(filters.districts);
  const selectedAreas = new Set(filters.areas);

  const filteredOccurrences = seed.occurrences.filter((row) => {
    if (row.alarm_time < startStamp || row.alarm_time > endStamp) {
      return false;
    }
    if (selectedAlertTypes.size > 0 && !selectedAlertTypes.has(row.alert_type)) {
      return false;
    }
    if (selectedDistricts.size > 0 && !selectedDistricts.has(row.district)) {
      return false;
    }
    if (selectedAreas.size > 0 && !selectedAreas.has(row.area)) {
      return false;
    }
    return true;
  });

  const dailyCounter = new Map<string, number>();
  const hourCounter = new Map<number, number>();
  const weekdayCounter = new Map<number, number>();
  const weekdayHourCounter = new Map<string, number>();
  const districtCounter = new Map<string, { count: number }>();
  const areaCounter = new Map<string, { count: number; area: string; district: string }>();
  const firstAlertByDay = new Map<string, string>();
  const lastAlertByDay = new Map<string, string>();

  for (const row of filteredOccurrences) {
    const day = dayKey(row.alarm_time);
    const hour = hourKey(row.alarm_time);
    const weekday = weekdayIndex(day);
    const weekdayHourKey = `${weekday}:${hour}`;
    const areaKey = `${row.area} · ${row.district}`;

    dailyCounter.set(day, (dailyCounter.get(day) ?? 0) + 1);
    hourCounter.set(hour, (hourCounter.get(hour) ?? 0) + 1);
    weekdayCounter.set(weekday, (weekdayCounter.get(weekday) ?? 0) + 1);
    weekdayHourCounter.set(weekdayHourKey, (weekdayHourCounter.get(weekdayHourKey) ?? 0) + 1);
    districtCounter.set(row.district, { count: (districtCounter.get(row.district)?.count ?? 0) + 1 });
    areaCounter.set(areaKey, {
      count: (areaCounter.get(areaKey)?.count ?? 0) + 1,
      area: row.area,
      district: row.district
    });

    const earliest = firstAlertByDay.get(day);
    const latest = lastAlertByDay.get(day);
    firstAlertByDay.set(day, earliest ? (row.alarm_time < earliest ? row.alarm_time : earliest) : row.alarm_time);
    lastAlertByDay.set(day, latest ? (row.alarm_time > latest ? row.alarm_time : latest) : row.alarm_time);
  }

  const datePoints = enumerateDates(filters.date_from, filters.date_to);
  const dailyValues = datePoints.map((day) => dailyCounter.get(day) ?? 0);
  const rolling = rollingAverage(dailyValues);
  const dailyCounts: DailyCountPoint[] = datePoints.map((day, index) => ({
    date: day,
    count: dailyCounter.get(day) ?? 0,
    rolling_average: rolling[index],
    first_alert_time: firstAlertByDay.get(day) ?? null,
    last_alert_time: lastAlertByDay.get(day) ?? null
  }));

  const hourOfDayCounts = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    count: hourCounter.get(hour) ?? 0
  }));

  const weekdayCounts = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    label: weekdayLabel(weekday),
    count: weekdayCounter.get(weekday) ?? 0
  }));

  const weekdayHourHeatmap = Array.from({ length: 7 * 24 }, (_, index) => {
    const weekday = Math.floor(index / 24);
    const hour = index % 24;
    return {
      weekday,
      weekday_label: weekdayLabel(weekday),
      hour,
      count: weekdayHourCounter.get(`${weekday}:${hour}`) ?? 0
    };
  });

  const eventBursts = eventBurstsFromOccurrences(filteredOccurrences);
  const biggestDay = [...dailyCounts].sort((left, right) => right.count - left.count)[0] ?? null;
  const biggestBurst = eventBursts[0] ?? null;

  const areaLocationMap = new Map(
    seed.area_locations.map((row) => [`${row.area}|${row.district}`, row] as const)
  );
  const mapPointCounter = new Map<string, MapPoint>();
  const unmappedCounter = new Map<string, number>();
  for (const row of filteredOccurrences) {
    const location = areaLocationMap.get(`${row.area}|${row.district}`);
    if (location && location.status === "mapped" && location.lat !== null && location.lng !== null) {
      const key = `${row.area}|${row.district}`;
      const existing = mapPointCounter.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        mapPointCounter.set(key, {
          area: row.area,
          district: row.district,
          lat: location.lat,
          lng: location.lng,
          count: 1
        });
      }
    } else {
      const label = `${row.area} · ${row.district}`;
      unmappedCounter.set(label, (unmappedCounter.get(label) ?? 0) + 1);
    }
  }

  const issues = filterIssues(seed.issues, filters);
  const issueTypeCounter = new Map<string, number>();
  for (const issue of issues) {
    issueTypeCounter.set(issue.issue_type, (issueTypeCounter.get(issue.issue_type) ?? 0) + 1);
  }

  return {
    filters,
    filteredOccurrences: [...filteredOccurrences].sort((left, right) => right.alarm_time.localeCompare(left.alarm_time)),
    overviewMetrics: {
      total_alerts: filteredOccurrences.length,
      unique_areas: new Set(filteredOccurrences.map((row) => `${row.area}|${row.district}`)).size,
      unique_districts: new Set(filteredOccurrences.map((row) => row.district)).size,
      biggest_day: biggestDay,
      biggest_burst: biggestBurst,
      coverage_start: seed.metadata.coverage_start,
      coverage_end: seed.metadata.coverage_end
    },
    dailyCounts,
    hourOfDayCounts,
    weekdayCounts,
    weekdayHourHeatmap,
    districtRankings: rankingsFromMap(
      new Map([...districtCounter.entries()].map(([key, value]) => [key, { count: value.count }])),
      filteredOccurrences.length,
      25
    ),
    areaRankings: rankingsFromMap(
      new Map([...areaCounter.entries()].map(([key, value]) => [key, value])),
      filteredOccurrences.length,
      25
    ),
    eventBursts,
    mapPoints: [...mapPointCounter.values()].sort((left, right) => right.count - left.count),
    qualityMetrics: {
      coverage_start: seed.metadata.coverage_start,
      coverage_end: seed.metadata.coverage_end,
      unknown_alert_rows: filteredOccurrences.filter((row) => row.alert_type === "UNKNOWN").length,
      unmapped_area_count: unmappedCounter.size,
      mapped_area_count: mapPointCounter.size,
      parse_issue_count: issues.length,
      top_unmapped_areas: [...unmappedCounter.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 25)
        .map(([label, count]) => ({ label, count })),
      top_issue_types: [...issueTypeCounter.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([label, count]) => ({ label, count })),
      recent_issues: issues.slice(0, 50)
    }
  };
}

export function firstLastSeries(dailyCounts: DailyCountPoint[]): Array<{ date: string; first: number | null; last: number | null }> {
  return dailyCounts.map((row) => ({
    date: row.date,
    first: timeToDecimal(row.first_alert_time),
    last: timeToDecimal(row.last_alert_time)
  }));
}

export function formatFirstLast(value: number | null): string {
  return formatHourValue(value);
}
