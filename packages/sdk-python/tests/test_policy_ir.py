"""
Conformance tests for Policy IR v1 schema validation.

Uses the shared fixtures in conformance/fixtures/policy-ir/ to prove parity
between the TypeScript and Python schema validators.
"""

from pathlib import Path

import pytest
import yaml

from veto.rules import validate_policy_ir, PolicySchemaError


FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "conformance" / "fixtures" / "policy-ir"


def _load_fixture(name: str) -> dict:
    with open(FIXTURES_DIR / name) as f:
        return yaml.safe_load(f)


class TestValidDocuments:
    def test_valid_minimal(self) -> None:
        data = _load_fixture("valid-minimal.yaml")
        validate_policy_ir(data)

    def test_valid_full(self) -> None:
        data = _load_fixture("valid-full.yaml")
        validate_policy_ir(data)


class TestInvalidDocuments:
    def test_missing_version(self) -> None:
        data = _load_fixture("invalid-missing-version.yaml")
        with pytest.raises(PolicySchemaError) as exc_info:
            validate_policy_ir(data)
        assert any("version" in e.message for e in exc_info.value.errors)

    def test_wrong_version(self) -> None:
        data = _load_fixture("invalid-wrong-version.yaml")
        with pytest.raises(PolicySchemaError):
            validate_policy_ir(data)

    def test_missing_rules(self) -> None:
        data = _load_fixture("invalid-missing-rules.yaml")
        with pytest.raises(PolicySchemaError) as exc_info:
            validate_policy_ir(data)
        assert any("rules" in e.message for e in exc_info.value.errors)

    def test_bad_action(self) -> None:
        data = _load_fixture("invalid-bad-action.yaml")
        with pytest.raises(PolicySchemaError):
            validate_policy_ir(data)

    def test_bad_operator(self) -> None:
        data = _load_fixture("invalid-bad-operator.yaml")
        with pytest.raises(PolicySchemaError):
            validate_policy_ir(data)

    def test_extra_field(self) -> None:
        data = _load_fixture("invalid-extra-field.yaml")
        with pytest.raises(PolicySchemaError):
            validate_policy_ir(data)

    def test_rule_missing_id(self) -> None:
        data = _load_fixture("invalid-rule-missing-id.yaml")
        with pytest.raises(PolicySchemaError):
            validate_policy_ir(data)


class TestErrorQuality:
    def test_actionable_error_messages(self) -> None:
        with pytest.raises(PolicySchemaError) as exc_info:
            validate_policy_ir({
                "version": "1.0",
                "rules": [
                    {"name": "no-id-no-action"},
                ],
            })
        errors = exc_info.value.errors
        assert len(errors) >= 2
        assert any("rules/0" in e.path for e in errors)
        assert "Invalid policy document" in str(exc_info.value)

    def test_reports_all_errors(self) -> None:
        with pytest.raises(PolicySchemaError) as exc_info:
            validate_policy_ir({})
        assert len(exc_info.value.errors) >= 2
