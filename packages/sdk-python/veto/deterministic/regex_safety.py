import re

MAX_PATTERN_LENGTH = 256

_NESTED_QUANTIFIER_ON_GROUP = re.compile(r'[+*}]\s*\)\s*[+*{]')
_ADJACENT_QUANTIFIERS = re.compile(r'[+*}]\s*[+*{]')
_OVERLAPPING_ALTERNATION = re.compile(r'\.\*.*\|.*\.\*')


def is_safe_pattern(pattern: str) -> bool:
    if len(pattern) > MAX_PATTERN_LENGTH:
        return False
    if _NESTED_QUANTIFIER_ON_GROUP.search(pattern):
        return False
    if _ADJACENT_QUANTIFIERS.search(pattern):
        return False
    if _OVERLAPPING_ALTERNATION.search(pattern):
        return False
    return True
