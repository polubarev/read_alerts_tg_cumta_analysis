# Red Alarms Analytics

The repository now contains both the Telegram parser and a static Next.js dashboard built on top of the parsed SQLite output.

## 1. Parse the Telegram export

Source input: [data/result.json](/Users/igorpolubarev/Personal/red_alarms/data/result.json)

```bash
python3 scripts/parse_alerts.py
```

Parser outputs are written to [parsed](/Users/igorpolubarev/Personal/red_alarms/parsed):

- [alert_occurrences.csv](/Users/igorpolubarev/Personal/red_alarms/parsed/alert_occurrences.csv): deduplicated rows per `(alarm_time, district, area, alert_type)`.
- [source_messages.csv](/Users/igorpolubarev/Personal/red_alarms/parsed/source_messages.csv): Telegram message fragments and parser metadata.
- [parse_issues.csv](/Users/igorpolubarev/Personal/red_alarms/parsed/parse_issues.csv): unresolved fragments for manual inspection.
- [red_alerts.sqlite](/Users/igorpolubarev/Personal/red_alarms/parsed/red_alerts.sqlite): canonical analytics database.
- [parse_summary.json](/Users/igorpolubarev/Personal/red_alarms/parsed/parse_summary.json): parser run summary.

## 2. Build dashboard data assets

The dashboard does not query SQLite in the browser. It uses a batch ETL that exports static JSON into [public/data](/Users/igorpolubarev/Personal/red_alarms/public/data):

```bash
npm run build-data
```

The ETL reads [red_alerts.sqlite](/Users/igorpolubarev/Personal/red_alarms/parsed/red_alerts.sqlite), applies the curated map rules in [area_location_rules.json](/Users/igorpolubarev/Personal/red_alarms/data/area_location_rules.json), and emits:

- [dashboard_seed.json](/Users/igorpolubarev/Personal/red_alarms/public/data/dashboard_seed.json): client-side seed dataset.
- [overview_metrics.json](/Users/igorpolubarev/Personal/red_alarms/public/data/overview_metrics.json)
- [daily_counts.json](/Users/igorpolubarev/Personal/red_alarms/public/data/daily_counts.json)
- [hour_of_day_counts.json](/Users/igorpolubarev/Personal/red_alarms/public/data/hour_of_day_counts.json)
- [weekday_counts.json](/Users/igorpolubarev/Personal/red_alarms/public/data/weekday_counts.json)
- [weekday_hour_heatmap.json](/Users/igorpolubarev/Personal/red_alarms/public/data/weekday_hour_heatmap.json)
- [district_rankings.json](/Users/igorpolubarev/Personal/red_alarms/public/data/district_rankings.json)
- [area_rankings.json](/Users/igorpolubarev/Personal/red_alarms/public/data/area_rankings.json)
- [event_bursts.json](/Users/igorpolubarev/Personal/red_alarms/public/data/event_bursts.json)
- [map_points.json](/Users/igorpolubarev/Personal/red_alarms/public/data/map_points.json)
- [quality_metrics.json](/Users/igorpolubarev/Personal/red_alarms/public/data/quality_metrics.json)
- [filtered_table_seed.json](/Users/igorpolubarev/Personal/red_alarms/public/data/filtered_table_seed.json)

## 3. Run or build the dashboard

```bash
npm install
npm run dev
```

Static export:

```bash
npm run build
```

The exported site is generated in [out](/Users/igorpolubarev/Personal/red_alarms/out).

The dashboard is desktop-first, defaults to `Цева адом`, keeps source location names as-is, includes raw table CSV export, and uses curated area coordinates for the map. Unmapped areas remain visible in rankings and quality views but are intentionally excluded from the map.
