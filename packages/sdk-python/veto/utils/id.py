"""
ID generation utilities for Veto.
"""

import uuid
import random
import string


def generate_id(prefix: str = "veto") -> str:
    """
    Generate a random ID for tool calls.

    Creates a unique identifier suitable for tracking tool call instances.

    Args:
        prefix: Optional prefix for the ID

    Returns:
        A unique string ID

    Example:
        >>> call_id = generate_id('call')
        # Returns something like: 'call_a1b2c3d4e5f6'
    """
    try:
        # Use uuid4 for secure random generation
        uuid_str = uuid.uuid4().hex[:12]
        return f"{prefix}_{uuid_str}"
    except Exception:
        # Fallback for environments where uuid might not work
        chars = string.ascii_lowercase + string.digits
        random_str = "".join(random.choice(chars) for _ in range(12))
        return f"{prefix}_{random_str}"


def generate_tool_call_id() -> str:
    """
    Generate a tool call ID in the format expected by providers.

    Returns:
        A unique tool call ID
    """
    return generate_id("call")
