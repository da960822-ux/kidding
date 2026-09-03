"""Semantic guards at the provider boundary, without network or database calls."""
import unittest

from app.main import parse_structure_output
from test_contracts import structure


class StructureAmbiguityTests(unittest.IsolatedAsyncioTestCase):
    async def test_deictic_location_cannot_silently_be_ready(self):
        raw = structure("ONION", "ONION_HARVEST")
        raw["location"] = {"raw_text": "저짝 밭", "kind": "DEICTIC", "canonical_name": None}
        state, ambiguities, interpretation = await parse_structure_output(raw)
        self.assertEqual(state.location.kind, "DEICTIC")
        self.assertIsNone(state.location.canonical_name)
        self.assertEqual(state.location_display, "저짝 밭")
        self.assertEqual(interpretation, "AMBIGUOUS")
        self.assertEqual([(item.kind, item.blocking) for item in ambiguities], [("LOCATION", False)])
        self.assertEqual(raw["ambiguities"], [])

    async def test_actual_location_conflict_is_not_downgraded_because_it_is_deictic(self):
        raw = structure("ONION", "ONION_HARVEST")
        raw["location"] = {"raw_text": "거기", "kind": "DEICTIC", "canonical_name": None}
        raw["ambiguities"] = [{"field": "location", "message": "서쪽과 동쪽 중 어느 밭인가요?", "blocking": True, "kind": "LOCATION"}]
        _, ambiguities, interpretation = await parse_structure_output(raw)
        self.assertEqual(interpretation, "AMBIGUOUS")
        self.assertEqual(len(ambiguities), 1)
        self.assertTrue(ambiguities[0].blocking)
        self.assertEqual(ambiguities[0].message, "서쪽과 동쪽 중 어느 밭인가요?")

    async def test_named_location_and_unknown_quantity_are_not_invented(self):
        raw = structure("ONION", "ONION_HARVEST")
        raw["location"] = {"raw_text": "3번 밭", "kind": "NAMED", "canonical_name": "3번 밭"}
        raw["quantity"] = "UNSPECIFIED"
        state, ambiguities, interpretation = await parse_structure_output(raw)
        self.assertEqual((state.quantity, ambiguities, interpretation), ("UNSPECIFIED", [], "READY"))


if __name__ == "__main__":
    unittest.main()
