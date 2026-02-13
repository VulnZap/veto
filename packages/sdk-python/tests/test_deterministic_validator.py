from veto.deterministic.types import ArgumentConstraint
from veto.deterministic.validator import validate_deterministic


def make_constraint(**overrides) -> ArgumentConstraint:
    return ArgumentConstraint(enabled=True, **overrides)


class TestNumberConstraints:
    def test_allow_values_within_range(self):
        constraints = [make_constraint(argument_name="amount", minimum=0, maximum=1000)]
        result = validate_deterministic("tool", {"amount": 500}, constraints)
        assert result.decision == "allow"

    def test_deny_values_below_minimum(self):
        constraints = [make_constraint(argument_name="amount", minimum=10)]
        result = validate_deterministic("tool", {"amount": 5}, constraints)
        assert result.decision == "deny"
        assert result.failed_argument == "amount"

    def test_deny_values_above_maximum(self):
        constraints = [make_constraint(argument_name="amount", maximum=100)]
        result = validate_deterministic("tool", {"amount": 150}, constraints)
        assert result.decision == "deny"

    def test_enforce_greater_than_exclusive(self):
        constraints = [make_constraint(argument_name="val", greater_than=10)]
        assert validate_deterministic("tool", {"val": 10}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"val": 11}, constraints).decision == "allow"

    def test_enforce_less_than_exclusive(self):
        constraints = [make_constraint(argument_name="val", less_than=10)]
        assert validate_deterministic("tool", {"val": 10}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"val": 9}, constraints).decision == "allow"

    def test_enforce_greater_than_or_equal(self):
        constraints = [make_constraint(argument_name="val", greater_than_or_equal=10)]
        assert validate_deterministic("tool", {"val": 9}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"val": 10}, constraints).decision == "allow"

    def test_enforce_less_than_or_equal(self):
        constraints = [make_constraint(argument_name="val", less_than_or_equal=10)]
        assert validate_deterministic("tool", {"val": 11}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"val": 10}, constraints).decision == "allow"


class TestStringConstraints:
    def test_enforce_min_length(self):
        constraints = [make_constraint(argument_name="name", min_length=3)]
        assert validate_deterministic("tool", {"name": "ab"}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"name": "abc"}, constraints).decision == "allow"

    def test_enforce_max_length(self):
        constraints = [make_constraint(argument_name="name", max_length=5)]
        assert validate_deterministic("tool", {"name": "abcdef"}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"name": "abcde"}, constraints).decision == "allow"

    def test_enforce_regex_pattern(self):
        constraints = [make_constraint(argument_name="email", regex="^[^@]+@[^@]+$")]
        assert validate_deterministic("tool", {"email": "user@example.com"}, constraints).decision == "allow"
        assert validate_deterministic("tool", {"email": "invalid"}, constraints).decision == "deny"

    def test_deny_on_unsafe_regex(self):
        constraints = [make_constraint(argument_name="val", regex="(a+)+")]
        result = validate_deterministic("tool", {"val": "anything"}, constraints)
        assert result.decision == "deny"
        assert "unsafe" in (result.reason or "")

    def test_deny_on_invalid_regex(self):
        constraints = [make_constraint(argument_name="val", regex="[invalid")]
        result = validate_deterministic("tool", {"val": "anything"}, constraints)
        assert result.decision == "deny"
        assert "invalid regex" in (result.reason or "")

    def test_deny_on_regex_exceeding_256_chars(self):
        constraints = [make_constraint(argument_name="val", regex="a" * 257)]
        result = validate_deterministic("tool", {"val": "a"}, constraints)
        assert result.decision == "deny"
        assert "too long" in (result.reason or "")

    def test_enforce_enum(self):
        constraints = [make_constraint(argument_name="color", enum=["red", "blue", "green"])]
        assert validate_deterministic("tool", {"color": "red"}, constraints).decision == "allow"
        assert validate_deterministic("tool", {"color": "purple"}, constraints).decision == "deny"


class TestArrayConstraints:
    def test_enforce_min_items(self):
        constraints = [make_constraint(argument_name="tags", min_items=2)]
        assert validate_deterministic("tool", {"tags": ["a"]}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"tags": ["a", "b"]}, constraints).decision == "allow"

    def test_enforce_max_items(self):
        constraints = [make_constraint(argument_name="tags", max_items=3)]
        assert validate_deterministic("tool", {"tags": ["a", "b", "c", "d"]}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"tags": ["a", "b", "c"]}, constraints).decision == "allow"


class TestPresenceConstraints:
    def test_deny_missing_required(self):
        constraints = [make_constraint(argument_name="name", required=True)]
        assert validate_deterministic("tool", {}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"name": "test"}, constraints).decision == "allow"

    def test_deny_null_when_not_null_set(self):
        constraints = [make_constraint(argument_name="name", not_null=True)]
        assert validate_deterministic("tool", {"name": None}, constraints).decision == "deny"

    def test_skip_missing_values_for_non_required(self):
        constraints = [make_constraint(argument_name="optional", minimum=0, maximum=100)]
        assert validate_deterministic("tool", {}, constraints).decision == "allow"


class TestDisabledConstraints:
    def test_skip_disabled(self):
        constraints = [ArgumentConstraint(argument_name="val", enabled=False, maximum=10)]
        assert validate_deterministic("tool", {"val": 999}, constraints).decision == "allow"


class TestMultipleConstraints:
    def test_short_circuit_on_first_failure(self):
        constraints = [
            make_constraint(argument_name="a", minimum=10),
            make_constraint(argument_name="b", minimum=10),
        ]
        result = validate_deterministic("tool", {"a": 5, "b": 5}, constraints)
        assert result.decision == "deny"
        assert result.failed_argument == "a"
        assert len(result.validations) == 1

    def test_validate_all_passing(self):
        constraints = [
            make_constraint(argument_name="a", minimum=0),
            make_constraint(argument_name="b", minimum=0),
        ]
        result = validate_deterministic("tool", {"a": 5, "b": 5}, constraints)
        assert result.decision == "allow"
        assert len(result.validations) == 2


class TestLatencyTracking:
    def test_includes_latency_ms(self):
        result = validate_deterministic("tool", {}, [])
        assert result.latency_ms >= 0


class TestEdgeCases:
    def test_allow_empty_constraints(self):
        result = validate_deterministic("tool", {"a": 1, "b": "x"}, [])
        assert result.decision == "allow"
        assert len(result.validations) == 0

    def test_pass_required_for_falsy_but_present(self):
        constraints = [make_constraint(argument_name="val", required=True)]
        assert validate_deterministic("tool", {"val": 0}, constraints).decision == "allow"
        assert validate_deterministic("tool", {"val": ""}, constraints).decision == "allow"
        assert validate_deterministic("tool", {"val": False}, constraints).decision == "allow"

    def test_pass_not_null_for_falsy_non_null(self):
        constraints = [make_constraint(argument_name="val", not_null=True)]
        assert validate_deterministic("tool", {"val": 0}, constraints).decision == "allow"
        assert validate_deterministic("tool", {"val": ""}, constraints).decision == "allow"
        assert validate_deterministic("tool", {"val": False}, constraints).decision == "allow"

    def test_pass_through_unknown_types(self):
        constraints = [make_constraint(argument_name="val", minimum=5)]
        assert validate_deterministic("tool", {"val": True}, constraints).decision == "allow"
        assert validate_deterministic("tool", {"val": {"nested": 1}}, constraints).decision == "allow"

    def test_deny_invalid_regex_combined_with_other_string_constraints(self):
        constraints = [make_constraint(argument_name="val", regex="[bad", min_length=3)]
        result = validate_deterministic("tool", {"val": "abcdef"}, constraints)
        assert result.decision == "deny"
        assert "invalid regex" in (result.reason or "")

    def test_deny_nan_values(self):
        constraints = [make_constraint(argument_name="val", minimum=0, maximum=100)]
        result = validate_deterministic("tool", {"val": float("nan")}, constraints)
        assert result.decision == "deny"
        assert "NaN" in (result.reason or "")

    def test_deny_infinity_values(self):
        constraints = [make_constraint(argument_name="val", minimum=0)]
        assert validate_deterministic("tool", {"val": float("inf")}, constraints).decision == "deny"
        assert validate_deterministic("tool", {"val": float("-inf")}, constraints).decision == "deny"

    def test_use_not_null_when_key_present_with_none(self):
        constraints = [make_constraint(argument_name="val", required=True, not_null=True)]
        result = validate_deterministic("tool", {"val": None}, constraints)
        assert result.decision == "deny"
        assert "cannot be null" in (result.reason or "")
