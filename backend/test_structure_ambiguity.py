"""Semantic guards at the provider boundary, without network or database calls."""
import unittest

from app.main import ApiError, DraftConfirmRequest, parse_draft, parse_structure_output, validate_confirm
from test_contracts import structure


class StructureAmbiguityTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_pure_omission_location_blocker_becomes_advisory(self):
        for raw_text in (None, "동쪽 밭이나 서쪽 밭"):
            with self.subTest(raw_text=raw_text):
                raw = structure("ONION", "ONION_HARVEST")
                raw["location"]["raw_text"] = raw_text
                raw["interpretation"] = "AMBIGUOUS"
                raw["ambiguities"] = [{"field": "location", "message": "장소 확인", "blocking": True, "kind": "LOCATION"}]
                state, ambiguities, interpretation = await parse_structure_output(raw)
                self.assertEqual(ambiguities[0].blocking, raw_text is not None)
                self.assertEqual(state.location.raw_text, raw_text)
                self.assertEqual(interpretation, "AMBIGUOUS")
                self.assertTrue(raw["ambiguities"][0]["blocking"])

    def test_saved_omission_draft_can_be_explicitly_confirmed_but_conflicts_cannot(self):
        confirmation = DraftConfirmRequest(expected_version=0, decision="PUBLISH_AS_IS", ambiguity_override=True, override_reason="OWNER_ACCEPTED_OTHER")
        for raw_text in (None, "동쪽 밭이나 서쪽 밭"):
            with self.subTest(raw_text=raw_text):
                raw = structure("ONION", "ONION_HARVEST")
                raw["location"]["raw_text"] = raw_text
                raw["interpretation"] = "AMBIGUOUS"
                raw["ambiguities"] = [{"field": "location", "message": "장소 확인", "blocking": True, "kind": "LOCATION"}]
                row = {"id": "draft-omitted", "draft_revision": 0, "summary_ko": raw["summary_ko"], "interpretation": "AMBIGUOUS", "state_json": raw, "ambiguities": raw["ambiguities"], "transcript": "양파 수확", "contract_version": "structure-v2", "ontology_version": "ontology-v2"}
                draft = parse_draft(row)
                self.assertTrue(row["ambiguities"][0]["blocking"])
                if raw_text is None:
                    self.assertFalse(draft.ambiguities[0].blocking)
                    validate_confirm(draft, confirmation)
                    with self.assertRaises(ApiError):
                        validate_confirm(draft, DraftConfirmRequest(expected_version=0, decision="CONFIRM"))
                else:
                    self.assertTrue(draft.ambiguities[0].blocking)
                    with self.assertRaises(ApiError):
                        validate_confirm(draft, confirmation)

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
