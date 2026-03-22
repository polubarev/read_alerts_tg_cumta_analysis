#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

HEADER_RE = re.compile(
    r"^(?P<alert_type>.+?) в (?P<header_targets>.+?) \[(?P<header_time>\d{2}:\d{2})\]:\s*",
    re.S,
)
TIMESTAMP_RE = re.compile(r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$")
TIMESTAMP_START_RE = re.compile(r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}:")
SUMMARY_CITIES_RE = re.compile(r"\|\| центральные населённые пункты: (.*?) \|\|", re.S)
SUMMARY_REGIONS_RE = re.compile(r"\|\| региональный совет: (.*?) \|\|", re.S)
CARRY_WINDOW_SECONDS = 15


@dataclass
class ParseState:
    alert_type: Optional[str] = None
    last_alarm_time: Optional[str] = None
    last_message_unixtime: Optional[int] = None


@dataclass
class OccurrenceFragment:
    alarm_time: str
    district: str
    area: str
    message_id: int
    message_date: str
    alert_type: Optional[str]


@dataclass
class ParsedMessage:
    message_id: int
    message_date: str
    raw_text: str
    classification: str
    alert_type: Optional[str]
    header_time: Optional[str]
    header_targets_raw: Optional[str]
    summary_cities_raw: Optional[str]
    summary_regions_raw: Optional[str]
    has_timestamps: bool
    used_carried_timestamp: bool = False
    carried_alert_type: bool = False
    last_alarm_time: Optional[str] = None
    parsed_occurrences: list[OccurrenceFragment] = field(default_factory=list)
    issues: list[dict[str, str]] = field(default_factory=list)


@dataclass
class AggregatedOccurrence:
    alarm_time: str
    district: str
    area: str
    alert_type: Optional[str] = None
    source_message_ids: set[int] = field(default_factory=set)
    source_message_dates: set[str] = field(default_factory=set)
    first_message_id: Optional[int] = None
    last_message_id: Optional[int] = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Parse Telegram red alert export into SQLite and CSV outputs."
    )
    parser.add_argument(
        "--input",
        default="data/result.json",
        help="Path to the Telegram export JSON.",
    )
    parser.add_argument(
        "--output-dir",
        default="parsed",
        help="Directory for generated CSV/SQLite outputs.",
    )
    return parser.parse_args()


def collapse_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u00a0", " ")).strip()


def normalize_linebreaks(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def message_entities(message: dict[str, Any]) -> list[dict[str, str]]:
    if isinstance(message.get("text_entities"), list):
        return [
            {"type": part.get("type", "plain"), "text": part.get("text", "")}
            for part in message["text_entities"]
        ]

    text = message.get("text")
    if isinstance(text, str):
        return [{"type": "plain", "text": text}]

    if isinstance(text, list):
        entities: list[dict[str, str]] = []
        for part in text:
            if isinstance(part, str):
                entities.append({"type": "plain", "text": part})
            elif isinstance(part, dict):
                entities.append(
                    {"type": part.get("type", "plain"), "text": part.get("text", "")}
                )
        return entities

    return []


def flatten_entities(entities: list[dict[str, str]]) -> str:
    return "".join(entity.get("text", "") for entity in entities)


def extract_header(raw_text: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    match = HEADER_RE.match(raw_text)
    if not match:
        return None, None, None
    return (
        collapse_spaces(match.group("alert_type")),
        collapse_spaces(match.group("header_targets")),
        match.group("header_time"),
    )


def extract_summary_values(raw_text: str) -> tuple[Optional[str], Optional[str]]:
    city_match = SUMMARY_CITIES_RE.search(raw_text)
    region_match = SUMMARY_REGIONS_RE.search(raw_text)
    cities = collapse_spaces(city_match.group(1)) if city_match else None
    regions = collapse_spaces(region_match.group(1)) if region_match else None
    return cities, regions


def classify_message(raw_text: str) -> str:
    stripped = raw_text.strip()
    if not stripped:
        return "empty"
    if HEADER_RE.match(stripped):
        return "header"
    if stripped.startswith("• "):
        return "continuation"
    if TIMESTAMP_START_RE.match(stripped):
        return "timestamp_start"
    if stripped.startswith("|| "):
        return "summary_footer"
    if stripped.startswith("Отправлено от "):
        return "footer_only"
    return "other"


def parse_alarm_time(text: str) -> str:
    return datetime.strptime(text, "%d/%m/%Y %H:%M:%S").isoformat()


def extract_area_text(plain_text: str) -> Optional[str]:
    match = re.match(r"^\s*-\s*(.*)$", normalize_linebreaks(plain_text), re.S)
    if not match:
        return None

    area_text = match.group(1)
    for marker in ("\n\n||", "\n||", "\n\nОтправлено от", "\nОтправлено от"):
        if marker in area_text:
            area_text = area_text.split(marker, 1)[0]

    area_text = re.sub(r"\n+\s*•\s*$", "", area_text)
    area_text = re.sub(r"\n+\s*$", "", area_text)
    area_text = area_text.strip(" \n")
    return area_text or None


def split_areas(area_text: str, district: str) -> list[str]:
    normalized_area_text = collapse_spaces(area_text)
    normalized_district = collapse_spaces(district)
    if not normalized_area_text:
        return []
    if normalized_area_text == normalized_district:
        return [normalized_area_text]
    return [
        collapse_spaces(part)
        for part in normalized_area_text.split(",")
        if collapse_spaces(part)
    ]


def should_carry(previous_state: ParseState, current_unixtime: int) -> bool:
    if previous_state.last_message_unixtime is None:
        return False
    return current_unixtime - previous_state.last_message_unixtime <= CARRY_WINDOW_SECONDS


def parse_message(message: dict[str, Any], state: ParseState) -> ParsedMessage:
    entities = message_entities(message)
    raw_text = normalize_linebreaks(flatten_entities(entities))
    stripped = raw_text.strip()
    classification = classify_message(raw_text)
    header_alert_type, header_targets, header_time = extract_header(stripped)
    summary_cities, summary_regions = extract_summary_values(stripped)
    has_timestamps = any(
        entity.get("type") == "italic" and TIMESTAMP_RE.match(entity.get("text", ""))
        for entity in entities
    )

    message_unixtime = int(message.get("date_unixtime", "0") or 0)
    can_carry = should_carry(state, message_unixtime)
    carried_alert_type = (
        state.alert_type if (header_alert_type is None and has_timestamps and can_carry) else None
    )
    carried_timestamp = (
        state.last_alarm_time if classification == "continuation" and can_carry else None
    )

    parsed = ParsedMessage(
        message_id=int(message["id"]),
        message_date=message["date"],
        raw_text=raw_text,
        classification=classification,
        alert_type=header_alert_type or carried_alert_type,
        header_time=header_time,
        header_targets_raw=header_targets,
        summary_cities_raw=summary_cities,
        summary_regions_raw=summary_regions,
        has_timestamps=has_timestamps,
        carried_alert_type=carried_alert_type is not None,
    )

    current_alarm_time: Optional[str] = None
    saw_first_timestamp = False

    for index, entity in enumerate(entities):
        entity_type = entity.get("type")
        entity_text = normalize_linebreaks(entity.get("text", ""))

        if entity_type == "plain" and not saw_first_timestamp:
            leading = entity_text.strip()
            if (
                leading
                and index == 0
                and not header_alert_type
                and not leading.startswith("•")
                and not leading.startswith("|| ")
                and not leading.startswith("Отправлено от ")
                and classification != "footer_only"
            ):
                parsed.issues.append(
                    {
                        "issue_type": "leading_plain_fragment",
                        "context": leading[:240],
                    }
                )

        if entity_type == "italic" and TIMESTAMP_RE.match(entity_text):
            current_alarm_time = parse_alarm_time(entity_text)
            parsed.last_alarm_time = current_alarm_time
            saw_first_timestamp = True
            continue

        if entity_type != "bold":
            continue

        next_entity = entities[index + 1] if index + 1 < len(entities) else None
        if not next_entity or next_entity.get("type") != "plain":
            continue

        district = collapse_spaces(entity_text)
        area_text = extract_area_text(next_entity.get("text", ""))
        if area_text is None:
            continue

        alarm_time = current_alarm_time or carried_timestamp
        if alarm_time is None:
            parsed.issues.append(
                {
                    "issue_type": "body_row_without_timestamp",
                    "context": f"{district} | {area_text[:180]}",
                }
            )
            continue

        if current_alarm_time is None and carried_timestamp is not None:
            parsed.used_carried_timestamp = True

        areas = split_areas(area_text, district)
        if not areas:
            parsed.issues.append(
                {
                    "issue_type": "empty_area_list",
                    "context": district,
                }
            )
            continue

        for area in areas:
            parsed.parsed_occurrences.append(
                OccurrenceFragment(
                    alarm_time=alarm_time,
                    district=district,
                    area=area,
                    message_id=parsed.message_id,
                    message_date=parsed.message_date,
                    alert_type=parsed.alert_type,
                )
            )

    if parsed.last_alarm_time is None and parsed.used_carried_timestamp:
        parsed.last_alarm_time = carried_timestamp

    return parsed


def next_state(previous_state: ParseState, parsed: ParsedMessage, message_unixtime: int) -> ParseState:
    if parsed.classification == "empty":
        return previous_state

    return ParseState(
        alert_type=parsed.alert_type or previous_state.alert_type,
        last_alarm_time=parsed.last_alarm_time or previous_state.last_alarm_time,
        last_message_unixtime=message_unixtime,
    )


def aggregate_occurrences(
    parsed_messages: list[ParsedMessage],
) -> dict[tuple[str, str, str, Optional[str]], AggregatedOccurrence]:
    grouped: dict[tuple[str, str, str], dict[Optional[str], list[OccurrenceFragment]]] = {}

    for parsed in parsed_messages:
        for fragment in parsed.parsed_occurrences:
            base_key = (fragment.alarm_time, fragment.district, fragment.area)
            typed_groups = grouped.setdefault(base_key, {})
            typed_groups.setdefault(fragment.alert_type, []).append(fragment)

    aggregated: dict[tuple[str, str, str, Optional[str]], AggregatedOccurrence] = {}
    for (alarm_time, district, area), typed_groups in grouped.items():
        known_types = sorted(alert_type for alert_type in typed_groups if alert_type)
        if len(known_types) <= 1:
            chosen_type = known_types[0] if known_types else None
            fragments = []
            for values in typed_groups.values():
                fragments.extend(values)
            aggregated[(alarm_time, district, area, chosen_type)] = build_aggregated_occurrence(
                alarm_time,
                district,
                area,
                chosen_type,
                fragments,
            )
            continue

        for alert_type in known_types:
            aggregated[(alarm_time, district, area, alert_type)] = build_aggregated_occurrence(
                alarm_time,
                district,
                area,
                alert_type,
                typed_groups[alert_type],
            )

        unknown_fragments = typed_groups.get(None, [])
        if unknown_fragments:
            aggregated[(alarm_time, district, area, None)] = build_aggregated_occurrence(
                alarm_time,
                district,
                area,
                None,
                unknown_fragments,
            )

    return aggregated


def occurrence_id(
    alarm_time: str, district: str, area: str, alert_type: Optional[str]
) -> str:
    raw = f"{alarm_time}\t{district}\t{area}\t{alert_type or ''}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def build_aggregated_occurrence(
    alarm_time: str,
    district: str,
    area: str,
    alert_type: Optional[str],
    fragments: list[OccurrenceFragment],
) -> AggregatedOccurrence:
    occurrence = AggregatedOccurrence(
        alarm_time=alarm_time,
        district=district,
        area=area,
        alert_type=alert_type,
    )
    for fragment in fragments:
        occurrence.source_message_ids.add(fragment.message_id)
        occurrence.source_message_dates.add(fragment.message_date)
        occurrence.first_message_id = min(
            occurrence.first_message_id or fragment.message_id, fragment.message_id
        )
        occurrence.last_message_id = max(
            occurrence.last_message_id or fragment.message_id, fragment.message_id
        )
    return occurrence


def write_occurrences_csv(
    output_path: Path,
    aggregated: dict[tuple[str, str, str, Optional[str]], AggregatedOccurrence],
) -> None:
    rows = sorted(
        aggregated.values(),
        key=lambda row: (row.alarm_time, row.district.casefold(), row.area.casefold()),
    )
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "occurrence_id",
                "alarm_time",
                "district",
                "area",
                "alert_type",
                "source_message_count",
                "source_message_ids",
                "first_message_id",
                "last_message_id",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "occurrence_id": occurrence_id(
                        row.alarm_time, row.district, row.area, row.alert_type
                    ),
                    "alarm_time": row.alarm_time,
                    "district": row.district,
                    "area": row.area,
                    "alert_type": row.alert_type or "",
                    "source_message_count": len(row.source_message_ids),
                    "source_message_ids": json.dumps(sorted(row.source_message_ids), ensure_ascii=False),
                    "first_message_id": row.first_message_id,
                    "last_message_id": row.last_message_id,
                }
            )


def write_messages_csv(output_path: Path, parsed_messages: list[ParsedMessage]) -> None:
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "message_id",
                "message_date",
                "classification",
                "alert_type",
                "header_time",
                "header_targets_raw",
                "summary_cities_raw",
                "summary_regions_raw",
                "has_timestamps",
                "used_carried_timestamp",
                "parsed_occurrence_count",
                "issue_count",
            ],
        )
        writer.writeheader()
        for parsed in parsed_messages:
            writer.writerow(
                {
                    "message_id": parsed.message_id,
                    "message_date": parsed.message_date,
                    "classification": parsed.classification,
                    "alert_type": parsed.alert_type or "",
                    "header_time": parsed.header_time or "",
                    "header_targets_raw": parsed.header_targets_raw or "",
                    "summary_cities_raw": parsed.summary_cities_raw or "",
                    "summary_regions_raw": parsed.summary_regions_raw or "",
                    "has_timestamps": int(parsed.has_timestamps),
                    "used_carried_timestamp": int(parsed.used_carried_timestamp),
                    "parsed_occurrence_count": len(parsed.parsed_occurrences),
                    "issue_count": len(parsed.issues),
                }
            )


def write_issues_csv(output_path: Path, parsed_messages: list[ParsedMessage]) -> int:
    issue_count = 0
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["message_id", "message_date", "issue_type", "context"],
        )
        writer.writeheader()
        for parsed in parsed_messages:
            for issue in parsed.issues:
                issue_count += 1
                writer.writerow(
                    {
                        "message_id": parsed.message_id,
                        "message_date": parsed.message_date,
                        "issue_type": issue["issue_type"],
                        "context": issue["context"],
                    }
                )
    return issue_count


def write_sqlite(
    output_path: Path,
    parsed_messages: list[ParsedMessage],
    aggregated: dict[tuple[str, str, str, Optional[str]], AggregatedOccurrence],
) -> None:
    connection = sqlite3.connect(output_path)
    try:
        cursor = connection.cursor()
        cursor.executescript(
            """
            DROP TABLE IF EXISTS source_messages;
            DROP TABLE IF EXISTS alert_occurrences;
            DROP TABLE IF EXISTS parse_issues;

            CREATE TABLE source_messages (
                message_id INTEGER PRIMARY KEY,
                message_date TEXT NOT NULL,
                classification TEXT NOT NULL,
                alert_type TEXT,
                header_time TEXT,
                header_targets_raw TEXT,
                summary_cities_raw TEXT,
                summary_regions_raw TEXT,
                has_timestamps INTEGER NOT NULL,
                used_carried_timestamp INTEGER NOT NULL,
                parsed_occurrence_count INTEGER NOT NULL,
                raw_text TEXT NOT NULL
            );

            CREATE TABLE alert_occurrences (
                occurrence_id TEXT PRIMARY KEY,
                alarm_time TEXT NOT NULL,
                district TEXT NOT NULL,
                area TEXT NOT NULL,
                alert_type TEXT,
                source_message_count INTEGER NOT NULL,
                source_message_ids TEXT NOT NULL,
                first_message_id INTEGER,
                last_message_id INTEGER
            );

            CREATE TABLE parse_issues (
                issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                message_date TEXT NOT NULL,
                issue_type TEXT NOT NULL,
                context TEXT NOT NULL
            );
            """
        )

        cursor.executemany(
            """
            INSERT INTO source_messages (
                message_id,
                message_date,
                classification,
                alert_type,
                header_time,
                header_targets_raw,
                summary_cities_raw,
                summary_regions_raw,
                has_timestamps,
                used_carried_timestamp,
                parsed_occurrence_count,
                raw_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    parsed.message_id,
                    parsed.message_date,
                    parsed.classification,
                    parsed.alert_type,
                    parsed.header_time,
                    parsed.header_targets_raw,
                    parsed.summary_cities_raw,
                    parsed.summary_regions_raw,
                    int(parsed.has_timestamps),
                    int(parsed.used_carried_timestamp),
                    len(parsed.parsed_occurrences),
                    parsed.raw_text,
                )
                for parsed in parsed_messages
            ],
        )

        cursor.executemany(
            """
            INSERT INTO alert_occurrences (
                occurrence_id,
                alarm_time,
                district,
                area,
                alert_type,
                source_message_count,
                source_message_ids,
                first_message_id,
                last_message_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    occurrence_id(row.alarm_time, row.district, row.area, row.alert_type),
                    row.alarm_time,
                    row.district,
                    row.area,
                    row.alert_type,
                    len(row.source_message_ids),
                    json.dumps(sorted(row.source_message_ids), ensure_ascii=False),
                    row.first_message_id,
                    row.last_message_id,
                )
                for row in sorted(
                    aggregated.values(),
                    key=lambda item: (
                        item.alarm_time,
                        item.district.casefold(),
                        item.area.casefold(),
                    ),
                )
            ],
        )

        cursor.executemany(
            """
            INSERT INTO parse_issues (
                message_id,
                message_date,
                issue_type,
                context
            ) VALUES (?, ?, ?, ?)
            """,
            [
                (
                    parsed.message_id,
                    parsed.message_date,
                    issue["issue_type"],
                    issue["context"],
                )
                for parsed in parsed_messages
                for issue in parsed.issues
            ],
        )

        connection.commit()
    finally:
        connection.close()


def write_summary_json(
    output_path: Path,
    parsed_messages: list[ParsedMessage],
    aggregated: dict[tuple[str, str, str, Optional[str]], AggregatedOccurrence],
    issue_count: int,
) -> None:
    classification_counts = Counter(parsed.classification for parsed in parsed_messages)
    alert_type_counts = Counter(row.alert_type or "UNKNOWN" for row in aggregated.values())
    fragment_count = sum(len(parsed.parsed_occurrences) for parsed in parsed_messages)
    summary = {
        "total_messages": len(parsed_messages),
        "messages_with_occurrences": sum(1 for parsed in parsed_messages if parsed.parsed_occurrences),
        "messages_using_carried_timestamp": sum(
            1 for parsed in parsed_messages if parsed.used_carried_timestamp
        ),
        "raw_occurrence_fragments": fragment_count,
        "unique_occurrences": len(aggregated),
        "issue_count": issue_count,
        "classification_counts": dict(sorted(classification_counts.items())),
        "unique_occurrence_alert_types": dict(sorted(alert_type_counts.items())),
    }
    output_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_messages(input_path: Path) -> list[dict[str, Any]]:
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    messages = payload.get("messages", [])
    return sorted(
        messages,
        key=lambda message: (
            int(message.get("date_unixtime", "0") or 0),
            int(message.get("id", 0)),
        ),
    )


def build_outputs(
    messages: list[dict[str, Any]],
) -> tuple[list[ParsedMessage], dict[tuple[str, str, str, Optional[str]], AggregatedOccurrence]]:
    parsed_messages: list[ParsedMessage] = []
    state = ParseState()

    for message in messages:
        parsed = parse_message(message, state)
        parsed_messages.append(parsed)
        state = next_state(state, parsed, int(message.get("date_unixtime", "0") or 0))

    aggregated = aggregate_occurrences(parsed_messages)
    return parsed_messages, aggregated


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    messages = load_messages(input_path)
    parsed_messages, aggregated = build_outputs(messages)

    occurrences_csv = output_dir / "alert_occurrences.csv"
    messages_csv = output_dir / "source_messages.csv"
    issues_csv = output_dir / "parse_issues.csv"
    sqlite_path = output_dir / "red_alerts.sqlite"
    summary_json = output_dir / "parse_summary.json"

    write_occurrences_csv(occurrences_csv, aggregated)
    write_messages_csv(messages_csv, parsed_messages)
    issue_count = write_issues_csv(issues_csv, parsed_messages)
    write_sqlite(sqlite_path, parsed_messages, aggregated)
    write_summary_json(summary_json, parsed_messages, aggregated, issue_count)

    print(f"Parsed {len(messages)} source messages")
    print(f"Wrote {len(aggregated)} unique alert occurrences")
    print(f"Wrote SQLite database to {sqlite_path}")
    print(f"Wrote CSV exports to {output_dir}")


if __name__ == "__main__":
    main()
