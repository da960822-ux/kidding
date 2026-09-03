"""Keep evaluation scoring strict without calling a provider or database."""
import unittest

from evaluate_dialect import mismatches


class DialectEvaluationTests(unittest.TestCase):
    def test_quantity_value_and_unit_are_compared(self):
        self.assertEqual(mismatches({"quantity": {"value": 20, "unit": "망"}}, {"quantity": {"value": 20, "unit": "망캐"}}, None, []), ["quantity"])

    def test_steps_must_match_in_order_without_missing_or_extra_steps(self):
        self.assertEqual(mismatches({"task_codes": ["ONION_HARVEST", "ONION_TRANSPORT"]}, {"steps": [{"task_code": "ONION_TRANSPORT"}]}, None, []), ["task_codes_order"])

    def test_unknown_quantity_cannot_become_a_number(self):
        self.assertEqual(mismatches({"unknown_quantity": True}, {"quantity": {"value": 2, "unit": "번"}}, None, []), ["invented_quantity"])
        self.assertEqual(mismatches({"unknown_quantity": True}, {"quantity": "UNSPECIFIED"}, None, []), [])

    def test_missing_ambiguity_does_not_pass(self):
        self.assertEqual(mismatches({"ambiguity_kind": "LOCATION", "blocking": False}, {}, None, []), ["ambiguity"])

    def test_named_location_must_preserve_the_named_field(self):
        self.assertEqual(mismatches({"location_name": "9번 밭"}, {"location": {"canonical_name": "1번 밭"}}, None, []), ["location_name"])

    def test_warning_only_cases_reject_unexpected_blocking(self):
        self.assertEqual(mismatches({"no_blocking": True}, {}, None, [{"kind": "LOCATION", "blocking": True}]), ["unexpected_blocking"])

    def test_deictic_location_never_accepts_an_invented_name(self):
        self.assertEqual(mismatches({"location_kind": "DEICTIC"}, {"location": {"kind": "DEICTIC", "canonical_name": "1번 밭"}}, None, []), ["invented_location"])

    def test_equivalent_named_location_spellings_are_explicit_gold_alternatives(self):
        expected = {"location_names": ["9번 밭", "아홉 번 밭"]}
        self.assertEqual(mismatches(expected, {"location": {"canonical_name": "아홉 번 밭"}}, None, []), [])
        self.assertEqual(mismatches(expected, {"location": {"canonical_name": "8번 밭"}}, None, []), ["location_name"])


if __name__ == "__main__":
    unittest.main()
