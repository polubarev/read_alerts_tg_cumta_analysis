#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[1]
SQLITE_PATH = ROOT / "parsed" / "red_alerts.sqlite"
RULES_PATH = ROOT / "data" / "area_location_rules.json"
OUTPUT_DIR = ROOT / "public" / "data"
DEFAULT_ALERT_TYPES = ["Цева адом"]
WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


@dataclass(frozen=True)
class Occurrence:
    occurrence_id: str
    alarm_time: str
    district: str
    area: str
    alert_type: Optional[str]
    source_message_count: int
    source_message_ids: tuple[int, ...]


@dataclass(frozen=True)
class AreaLocation:
    area: str
    district: str
    lat: Optional[float]
    lng: Optional[float]
    status: str
    resolution: str


def load_rules() -> dict[str, Any]:
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def load_occurrences(connection: sqlite3.Connection) -> list[Occurrence]:
    rows = connection.execute(
        """
        SELECT occurrence_id, alarm_time, district, area, alert_type, source_message_count, source_message_ids
        FROM alert_occurrences
        ORDER BY alarm_time, district, area, alert_type
        """
    ).fetchall()
    return [
        Occurrence(
            occurrence_id=row[0],
            alarm_time=row[1],
            district=row[2],
            area=row[3],
            alert_type=row[4],
            source_message_count=row[5],
            source_message_ids=tuple(json.loads(row[6])),
        )
        for row in rows
    ]


def load_issues(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT message_id, message_date, issue_type, context
        FROM parse_issues
        ORDER BY message_date DESC, message_id DESC
        """
    ).fetchall()
    return [
        {
            "message_id": row[0],
            "message_date": row[1],
            "issue_type": row[2],
            "context": row[3],
        }
        for row in rows
    ]


def find_location(area: str, district: str, rules: dict[str, Any]) -> AreaLocation:
    for rule in rules["exact_rules"]:
        if rule["area"] == area:
            return AreaLocation(
                area=area,
                district=district,
                lat=rule["lat"],
                lng=rule["lng"],
                status="mapped",
                resolution="exact",
            )

    for rule in rules["prefix_rules"]:
        if area.startswith(rule["area_prefix"]):
            return AreaLocation(
                area=area,
                district=district,
                lat=rule["lat"],
                lng=rule["lng"],
                status="mapped",
                resolution="prefix",
            )

    return AreaLocation(
        area=area,
        district=district,
        lat=None,
        lng=None,
        status="unmapped",
        resolution="none",
    )


def iso_to_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


def date_key(value: str) -> str:
    return value[:10]


def hour_key(value: str) -> int:
    return int(value[11:13])


def weekday_index(date_value: str) -> int:
    year, month, day = (int(part) for part in date_value.split("-"))
    return datetime(year, month, day).weekday() % 7 + 1 if False else datetime(year, month, day).weekday()


def weekday_index_sun_first(date_value: str) -> int:
    year, month, day = (int(part) for part in date_value.split("-"))
    python_weekday = datetime(year, month, day).weekday()
    return (python_weekday + 1) % 7


def daterange(start_date: str, end_date: str) -> list[str]:
    current = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)
    values: list[str] = []
    while current <= end:
        values.append(current.date().isoformat())
        current += timedelta(days=1)
    return values


def rolling_average(values: list[int], window: int) -> list[float]:
    output: list[float] = []
    for index in range(len(values)):
        start = max(0, index - window + 1)
        window_values = values[start : index + 1]
        output.append(round(sum(window_values) / len(window_values), 2))
    return output


def filter_occurrences(
    occurrences: list[Occurrence],
    filters: dict[str, Any],
) -> list[Occurrence]:
    start_stamp = f"{filters['date_from']}T00:00:00"
    end_stamp = f"{filters['date_to']}T23:59:59"
    alert_types = set(filters["alert_types"])
    districts = set(filters["districts"])
    areas = set(filters["areas"])

    filtered: list[Occurrence] = []
    for row in occurrences:
        if row.alarm_time < start_stamp or row.alarm_time > end_stamp:
            continue
        if alert_types and (row.alert_type or "UNKNOWN") not in alert_types:
            continue
        if districts and row.district not in districts:
            continue
        if areas and row.area not in areas:
            continue
        filtered.append(row)
    return filtered


def ranking_from_counter(counter: Counter[str], total: int, limit: int) -> list[dict[str, Any]]:
    rows = []
    for label, count in counter.most_common(limit):
        rows.append(
            {
                "label": label,
                "count": count,
                "share": round(count / total, 4) if total else 0,
            }
        )
    return rows


def build_event_bursts(filtered: list[Occurrence]) -> list[dict[str, Any]]:
    grouped: dict[str, list[Occurrence]] = defaultdict(list)
    for row in filtered:
        grouped[row.alarm_time].append(row)

    bursts: list[dict[str, Any]] = []
    for alarm_time, rows in grouped.items():
        area_keys = {(row.area, row.district) for row in rows}
        source_ids = sorted({source_id for row in rows for source_id in row.source_message_ids})
        bursts.append(
            {
                "alarm_time": alarm_time,
                "burst_size": len(area_keys),
                "total_occurrences": len(rows),
                "districts": sorted({row.district for row in rows}),
                "areas": sorted({row.area for row in rows}),
                "alert_types": sorted({row.alert_type or "UNKNOWN" for row in rows}),
                "source_message_ids": source_ids,
            }
        )

    return sorted(
        bursts,
        key=lambda row: (-row["burst_size"], row["alarm_time"]),
    )


def build_dashboard_payload(
    occurrences: list[Occurrence],
    locations: dict[tuple[str, str], AreaLocation],
    issues: list[dict[str, Any]],
    filters: dict[str, Any],
    coverage_start: str,
    coverage_end: str,
) -> dict[str, Any]:
    filtered = filter_occurrences(occurrences, filters)
    total_alerts = len(filtered)
    unique_areas = len({(row.area, row.district) for row in filtered})
    unique_districts = len({row.district for row in filtered})

    day_counter: Counter[str] = Counter()
    hour_counter: Counter[int] = Counter()
    weekday_counter: Counter[int] = Counter()
    weekday_hour_counter: Counter[tuple[int, int]] = Counter()
    district_counter: Counter[str] = Counter()
    area_counter: Counter[str] = Counter()
    first_alert_by_day: dict[str, str] = {}
    last_alert_by_day: dict[str, str] = {}

    for row in filtered:
        day = date_key(row.alarm_time)
        hour = hour_key(row.alarm_time)
        weekday = weekday_index_sun_first(day)
        area_key = f"{row.area} · {row.district}"

        day_counter[day] += 1
        hour_counter[hour] += 1
        weekday_counter[weekday] += 1
        weekday_hour_counter[(weekday, hour)] += 1
        district_counter[row.district] += 1
        area_counter[area_key] += 1

        first_alert_by_day[day] = min(first_alert_by_day.get(day, row.alarm_time), row.alarm_time)
        last_alert_by_day[day] = max(last_alert_by_day.get(day, row.alarm_time), row.alarm_time)

    date_points = daterange(filters["date_from"], filters["date_to"])
    daily_values = [day_counter[day] for day in date_points]
    rolling = rolling_average(daily_values, 7)
    daily_counts = [
        {
            "date": day,
            "count": day_counter[day],
            "rolling_average": rolling[index],
            "first_alert_time": first_alert_by_day.get(day),
            "last_alert_time": last_alert_by_day.get(day),
        }
        for index, day in enumerate(date_points)
    ]

    hour_of_day_counts = [
        {"hour": hour, "label": f"{hour:02d}:00", "count": hour_counter[hour]}
        for hour in range(24)
    ]
    weekday_counts = [
        {
            "weekday": weekday,
            "label": WEEKDAY_LABELS[weekday],
            "count": weekday_counter[weekday],
        }
        for weekday in range(7)
    ]
    weekday_hour_heatmap = [
        {
            "weekday": weekday,
            "weekday_label": WEEKDAY_LABELS[weekday],
            "hour": hour,
            "count": weekday_hour_counter[(weekday, hour)],
        }
        for weekday in range(7)
        for hour in range(24)
    ]

    bursts = build_event_bursts(filtered)
    biggest_day = max(daily_counts, key=lambda row: row["count"], default=None)
    biggest_burst = max(bursts, key=lambda row: row["burst_size"], default=None)

    mapped_counter: dict[tuple[str, str], int] = defaultdict(int)
    unmapped_counter: Counter[str] = Counter()
    for row in filtered:
        location = locations[(row.area, row.district)]
        if location.status == "mapped":
            mapped_counter[(row.area, row.district)] += 1
        else:
            unmapped_counter[f"{row.area} · {row.district}"] += 1

    map_points = []
    for (area, district), count in mapped_counter.items():
        location = locations[(area, district)]
        map_points.append(
            {
                "area": area,
                "district": district,
                "lat": location.lat,
                "lng": location.lng,
                "count": count,
            }
        )

    filtered_issues = [
        issue
        for issue in issues
        if filters["date_from"] <= issue["message_date"][:10] <= filters["date_to"]
    ]
    unknown_alert_rows = sum(1 for row in filtered if row.alert_type is None)
    mapped_area_count = len(mapped_counter)
    unmapped_area_count = len(unmapped_counter)

    return {
        "overview_metrics": {
            "total_alerts": total_alerts,
            "unique_areas": unique_areas,
            "unique_districts": unique_districts,
            "biggest_day": biggest_day,
            "biggest_burst": biggest_burst,
            "coverage_start": coverage_start,
            "coverage_end": coverage_end,
        },
        "daily_counts": daily_counts,
        "hour_of_day_counts": hour_of_day_counts,
        "weekday_counts": weekday_counts,
        "weekday_hour_heatmap": weekday_hour_heatmap,
        "district_rankings": ranking_from_counter(district_counter, total_alerts, 25),
        "area_rankings": ranking_from_counter(area_counter, total_alerts, 25),
        "event_bursts": bursts[:300],
        "map_points": sorted(map_points, key=lambda row: row["count"], reverse=True),
        "quality_metrics": {
            "coverage_start": coverage_start,
            "coverage_end": coverage_end,
            "unknown_alert_rows": unknown_alert_rows,
            "unmapped_area_count": unmapped_area_count,
            "mapped_area_count": mapped_area_count,
            "parse_issue_count": len(filtered_issues),
            "top_unmapped_areas": [
                {"label": label, "count": count}
                for label, count in unmapped_counter.most_common(25)
            ],
            "top_issue_types": [
                {"label": label, "count": count}
                for label, count in Counter(issue["issue_type"] for issue in filtered_issues).most_common(10)
            ],
            "recent_issues": filtered_issues[:50],
        },
        "filtered_table_seed": [
            {
                "occurrence_id": row.occurrence_id,
                "alarm_time": row.alarm_time,
                "district": row.district,
                "area": row.area,
                "alert_type": row.alert_type or "UNKNOWN",
                "source_message_count": row.source_message_count,
                "source_message_ids": list(row.source_message_ids),
            }
            for row in sorted(filtered, key=lambda item: item.alarm_time, reverse=True)[:2000]
        ],
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    rules = load_rules()
    connection = sqlite3.connect(SQLITE_PATH)
    try:
        occurrences = load_occurrences(connection)
        issues = load_issues(connection)
    finally:
        connection.close()

    area_locations: dict[tuple[str, str], AreaLocation] = {}
    for row in occurrences:
        key = (row.area, row.district)
        if key not in area_locations:
            area_locations[key] = find_location(row.area, row.district, rules)

    coverage_start = min(row.alarm_time for row in occurrences)
    coverage_end = max(row.alarm_time for row in occurrences)
    default_filters = {
        "date_from": coverage_start[:10],
        "date_to": coverage_end[:10],
        "alert_types": DEFAULT_ALERT_TYPES,
        "districts": [],
        "areas": [],
    }

    seed = {
        "metadata": {
            "generated_at": datetime.now(UTC).isoformat(),
            "coverage_start": coverage_start,
            "coverage_end": coverage_end,
            "default_alert_types": DEFAULT_ALERT_TYPES,
            "total_occurrences": len(occurrences),
            "mapped_area_count": sum(1 for row in area_locations.values() if row.status == "mapped"),
            "unmapped_area_count": sum(1 for row in area_locations.values() if row.status == "unmapped"),
        },
        "filter_options": {
            "alert_types": sorted({row.alert_type or "UNKNOWN" for row in occurrences}),
            "districts": sorted({row.district for row in occurrences}),
            "areas": sorted({row.area for row in occurrences}),
        },
        "occurrences": [
            {
                "occurrence_id": row.occurrence_id,
                "alarm_time": row.alarm_time,
                "district": row.district,
                "area": row.area,
                "alert_type": row.alert_type or "UNKNOWN",
                "source_message_count": row.source_message_count,
                "source_message_ids": list(row.source_message_ids),
            }
            for row in occurrences
        ],
        "area_locations": [
            {
                "area": row.area,
                "district": row.district,
                "lat": row.lat,
                "lng": row.lng,
                "status": row.status,
                "resolution": row.resolution,
            }
            for row in sorted(area_locations.values(), key=lambda item: (item.district, item.area))
        ],
        "issues": issues,
    }

    seed_path = OUTPUT_DIR / "dashboard_seed.json"
    seed_path.write_text(json.dumps(seed, ensure_ascii=False), encoding="utf-8")

    derived = build_dashboard_payload(
        occurrences=occurrences,
        locations=area_locations,
        issues=issues,
        filters=default_filters,
        coverage_start=coverage_start,
        coverage_end=coverage_end,
    )

    for file_name, payload in derived.items():
        output_path = OUTPUT_DIR / f"{file_name}.json"
        output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    summary_path = OUTPUT_DIR / "manifest.json"
    summary_path.write_text(
        json.dumps(
            {
                "generated_at": seed["metadata"]["generated_at"],
                "default_filters": default_filters,
                "files": sorted(path.name for path in OUTPUT_DIR.glob("*.json")),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Wrote dashboard seed to {seed_path}")
    print(f"Wrote {len(derived)} derived datasets to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
