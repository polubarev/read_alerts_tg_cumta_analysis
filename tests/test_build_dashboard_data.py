from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_dashboard_data


class BuildDashboardDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rules = {
            "exact_rules": [
                {"area": "Петах Тиква", "lat": 32.1, "lng": 34.9},
            ],
            "prefix_rules": [
                {"area_prefix": "Иерусалим - ", "lat": 31.7, "lng": 35.2},
            ],
        }

    def test_find_location_prefers_exact_rule(self) -> None:
        location = build_dashboard_data.find_location("Петах Тиква", "Дан", self.rules)
        self.assertEqual(location.status, "mapped")
        self.assertEqual(location.resolution, "exact")
        self.assertEqual((location.lat, location.lng), (32.1, 34.9))

    def test_find_location_uses_prefix_when_exact_missing(self) -> None:
        location = build_dashboard_data.find_location("Иерусалим - центр", "Иерусалим", self.rules)
        self.assertEqual(location.status, "mapped")
        self.assertEqual(location.resolution, "prefix")

    def test_build_dashboard_payload_counts_burst_size_by_distinct_areas(self) -> None:
        occurrences = [
            build_dashboard_data.Occurrence(
                occurrence_id="a",
                alarm_time="2026-03-01T10:00:00",
                district="Дан",
                area="Петах Тиква",
                alert_type="Цева адом",
                source_message_count=1,
                source_message_ids=(1,),
            ),
            build_dashboard_data.Occurrence(
                occurrence_id="b",
                alarm_time="2026-03-01T10:00:00",
                district="Дан",
                area="Петах Тиква",
                alert_type="Цева адом",
                source_message_count=1,
                source_message_ids=(2,),
            ),
            build_dashboard_data.Occurrence(
                occurrence_id="c",
                alarm_time="2026-03-01T10:00:00",
                district="Дан",
                area="Бней Брак",
                alert_type="Цева адом",
                source_message_count=1,
                source_message_ids=(3,),
            ),
        ]
        locations = {
            ("Петах Тиква", "Дан"): build_dashboard_data.AreaLocation(
                area="Петах Тиква",
                district="Дан",
                lat=32.1,
                lng=34.9,
                status="mapped",
                resolution="exact",
            ),
            ("Бней Брак", "Дан"): build_dashboard_data.AreaLocation(
                area="Бней Брак",
                district="Дан",
                lat=None,
                lng=None,
                status="unmapped",
                resolution="none",
            ),
        }
        payload = build_dashboard_data.build_dashboard_payload(
            occurrences=occurrences,
            locations=locations,
            issues=[],
            filters={
                "date_from": "2026-03-01",
                "date_to": "2026-03-01",
                "alert_types": ["Цева адом"],
                "districts": [],
                "areas": [],
            },
            coverage_start="2026-03-01T10:00:00",
            coverage_end="2026-03-01T10:00:00",
        )

        self.assertEqual(payload["overview_metrics"]["total_alerts"], 3)
        self.assertEqual(payload["event_bursts"][0]["burst_size"], 2)
        self.assertEqual(payload["quality_metrics"]["unmapped_area_count"], 1)


if __name__ == "__main__":
    unittest.main()
