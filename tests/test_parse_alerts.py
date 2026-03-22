from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import parse_alerts


class ParseAlertsTests(unittest.TestCase):
    def test_split_areas_keeps_single_area_when_it_matches_district(self) -> None:
        areas = parse_alerts.split_areas(
            "נוף איילון, שעלבים",
            "נוף איילון, שעלבים",
        )
        self.assertEqual(areas, ["נוף איילון, שעלבים"])

    def test_split_message_carries_timestamp_and_alert_type(self) -> None:
        messages = [
            {
                "id": 1,
                "date": "2026-01-01T00:00:10",
                "date_unixtime": "1767225610",
                "text_entities": [
                    {
                        "type": "plain",
                        "text": "Цева адом в Тестовый город [00:00]:\n\n",
                    },
                    {"type": "italic", "text": "01/01/2026 00:00:05"},
                    {"type": "plain", "text": ":\n • "},
                    {"type": "bold", "text": "Дан"},
                    {"type": "plain", "text": " - Холон\n"},
                ],
            },
            {
                "id": 2,
                "date": "2026-01-01T00:00:11",
                "date_unixtime": "1767225611",
                "text_entities": [
                    {"type": "plain", "text": "• "},
                    {"type": "bold", "text": "Дан"},
                    {"type": "plain", "text": " - Бат-Ям\n\n"},
                    {"type": "italic", "text": "01/01/2026 00:00:06"},
                    {"type": "plain", "text": ":\n • "},
                    {"type": "bold", "text": "Шарон"},
                    {
                        "type": "plain",
                        "text": " - Герцлия\n\nОтправлено от @channel",
                    },
                ],
            },
        ]

        parsed_messages, aggregated = parse_alerts.build_outputs(messages)

        self.assertTrue(parsed_messages[1].used_carried_timestamp)
        self.assertEqual(parsed_messages[1].alert_type, "Цева адом")
        self.assertIn(("2026-01-01T00:00:05", "Дан", "Бат-Ям", "Цева адом"), aggregated)
        self.assertIn(("2026-01-01T00:00:06", "Шарон", "Герцлия", "Цева адом"), aggregated)

    def test_headerless_timestamp_block_inherits_previous_alert_type(self) -> None:
        messages = [
            {
                "id": 10,
                "date": "2026-01-01T00:01:00",
                "date_unixtime": "1767225660",
                "text_entities": [
                    {
                        "type": "plain",
                        "text": "Проникновение Беспилотного летательного аппарата в Тест [00:01]:\n\n",
                    },
                    {"type": "italic", "text": "01/01/2026 00:01:00"},
                    {"type": "plain", "text": ":\n • "},
                    {"type": "bold", "text": "Север"},
                    {"type": "plain", "text": " - Тест 1\n"},
                ],
            },
            {
                "id": 11,
                "date": "2026-01-01T00:01:05",
                "date_unixtime": "1767225665",
                "text_entities": [
                    {
                        "type": "plain",
                        "text": "Тест 2, Тест 3\n\n",
                    },
                    {"type": "italic", "text": "01/01/2026 00:01:04"},
                    {"type": "plain", "text": ":\n • "},
                    {"type": "bold", "text": "Север"},
                    {"type": "plain", "text": " - Тест 4\n\nОтправлено от @channel"},
                ],
            },
        ]

        parsed_messages, aggregated = parse_alerts.build_outputs(messages)
        key = (
            "2026-01-01T00:01:04",
            "Север",
            "Тест 4",
            "Проникновение Беспилотного летательного аппарата",
        )

        self.assertEqual(
            parsed_messages[1].alert_type,
            "Проникновение Беспилотного летательного аппарата",
        )
        self.assertIn(key, aggregated)
        self.assertEqual(
            aggregated[key].alert_type,
            "Проникновение Беспилотного летательного аппарата",
        )


if __name__ == "__main__":
    unittest.main()
