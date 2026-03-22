export interface AlertOccurrence {
  occurrence_id: string;
  alarm_time: string;
  district: string;
  area: string;
  alert_type: string;
  source_message_count: number;
  source_message_ids: number[];
}

export interface AreaLocation {
  area: string;
  district: string;
  lat: number | null;
  lng: number | null;
  status: "mapped" | "unmapped";
  resolution: "exact" | "prefix" | "none";
}

export interface ParseIssue {
  message_id: number;
  message_date: string;
  issue_type: string;
  context: string;
}

export interface DashboardSeed {
  metadata: {
    generated_at: string;
    coverage_start: string;
    coverage_end: string;
    default_alert_types: string[];
    total_occurrences: number;
    mapped_area_count: number;
    unmapped_area_count: number;
  };
  filter_options: {
    alert_types: string[];
    districts: string[];
    areas: string[];
  };
  occurrences: AlertOccurrence[];
  area_locations: AreaLocation[];
  issues: ParseIssue[];
}

export interface DashboardFilters {
  date_from: string;
  date_to: string;
  alert_types: string[];
  districts: string[];
  areas: string[];
}

export interface DailyCountPoint {
  date: string;
  count: number;
  rolling_average: number;
  first_alert_time: string | null;
  last_alert_time: string | null;
}

export interface RankingItem {
  key: string;
  label: string;
  count: number;
  share: number;
  area?: string;
  district?: string;
}

export interface EventBurst {
  alarm_time: string;
  burst_size: number;
  total_occurrences: number;
  districts: string[];
  areas: string[];
  alert_types: string[];
  source_message_ids: number[];
}

export interface MapPoint {
  area: string;
  district: string;
  lat: number;
  lng: number;
  count: number;
}

export interface QualityMetrics {
  coverage_start: string;
  coverage_end: string;
  unknown_alert_rows: number;
  unmapped_area_count: number;
  mapped_area_count: number;
  parse_issue_count: number;
  top_unmapped_areas: Array<{ label: string; count: number }>;
  top_issue_types: Array<{ label: string; count: number }>;
  recent_issues: ParseIssue[];
}

export interface OverviewMetrics {
  total_alerts: number;
  unique_areas: number;
  unique_districts: number;
  biggest_day: DailyCountPoint | null;
  biggest_burst: EventBurst | null;
  coverage_start: string;
  coverage_end: string;
}

export interface DashboardModel {
  filters: DashboardFilters;
  filteredOccurrences: AlertOccurrence[];
  overviewMetrics: OverviewMetrics;
  dailyCounts: DailyCountPoint[];
  hourOfDayCounts: Array<{ hour: number; label: string; count: number }>;
  weekdayCounts: Array<{ weekday: number; label: string; count: number }>;
  weekdayHourHeatmap: Array<{
    weekday: number;
    weekday_label: string;
    hour: number;
    count: number;
  }>;
  districtRankings: RankingItem[];
  areaRankings: RankingItem[];
  eventBursts: EventBurst[];
  mapPoints: MapPoint[];
  qualityMetrics: QualityMetrics;
}
