from veto.deterministic.regex_safety import is_safe_pattern


class TestIsSafePattern:
    def test_accept_simple_patterns(self):
        assert is_safe_pattern("^[a-z]+$") is True
        assert is_safe_pattern(r"^\d{3}-\d{4}$") is True
        assert is_safe_pattern("^https?://.*") is True
        assert is_safe_pattern("[A-Za-z0-9_]+") is True

    def test_reject_patterns_longer_than_256(self):
        assert is_safe_pattern("a" * 257) is False

    def test_accept_patterns_at_exactly_256(self):
        assert is_safe_pattern("a" * 256) is True

    def test_reject_nested_quantifiers(self):
        assert is_safe_pattern("(a+)+") is False
        assert is_safe_pattern("(a*)*") is False
        assert is_safe_pattern("(a{1,3})*") is False
        assert is_safe_pattern("(a+){2,}") is False

    def test_reject_overlapping_alternation_with_wildcards(self):
        assert is_safe_pattern(".*foo|.*bar") is False

    def test_accept_safe_alternation(self):
        assert is_safe_pattern("foo|bar|baz") is True

    def test_accept_empty_pattern(self):
        assert is_safe_pattern("") is True
