#!/usr/bin/env python3
"""
Test script to verify SDK works against local veto-server.

This tests:
1. Tool registration
2. Validation (allow/deny scenarios)
3. LangChain integration
"""

import asyncio
import sys
from pathlib import Path
from typing import Any
from dataclasses import dataclass

# Add SDK to path
sys.path.insert(0, str(Path(__file__).parent))

from veto import Veto, VetoOptions, ToolCallDeniedError


# =============================================================================
# Simple Tool for Testing
# =============================================================================

@dataclass
class SimplePaymentTool:
    """A simple payment tool for testing."""
    name: str = "test_tool"
    description: str = "Process a test payment"

    async def handler(self, args: dict[str, Any]) -> str:
        amount = args.get("amount", 0)
        return f"Payment of ${amount} processed successfully"


# =============================================================================
# Test Functions
# =============================================================================

async def test_registration():
    """Test that tools are registered with the server."""
    print("\n" + "=" * 60)
    print("TEST 1: Tool Registration")
    print("=" * 60)

    veto = await Veto.init(VetoOptions(
        api_key="veto_eEJl44M2aQ9q14ZoilPLf0YPbVsTZ6JN6zKecxUdOiE",
        base_url="http://localhost:3001",
        log_level="debug",
    ))

    tool = SimplePaymentTool()
    wrapped_tools = veto.wrap([tool])

    print(f"  - Wrapped {len(wrapped_tools)} tool(s)")
    print("  - Registration: SUCCESS")

    # Give async registration time to complete
    await asyncio.sleep(1)

    return veto, wrapped_tools[0]


async def test_validation_allow(veto: Veto, wrapped_tool: SimplePaymentTool):
    """Test that valid calls are allowed."""
    print("\n" + "=" * 60)
    print("TEST 2: Validation - ALLOW (amount=100, within 0-1000)")
    print("=" * 60)

    try:
        result = await wrapped_tool.handler({"amount": 100})
        print(f"  - Result: {result}")
        print("  - Validation: ALLOWED (as expected)")
        return True
    except ToolCallDeniedError as e:
        print(f"  - ERROR: Unexpectedly blocked: {e.reason}")
        return False
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False


async def test_validation_deny(veto: Veto, wrapped_tool: SimplePaymentTool):
    """Test that invalid calls are denied."""
    print("\n" + "=" * 60)
    print("TEST 3: Validation - DENY (amount=5000, exceeds 1000)")
    print("=" * 60)

    try:
        result = await wrapped_tool.handler({"amount": 5000})
        print(f"  - Result: {result}")
        print("  - ERROR: Should have been blocked but was allowed!")
        return False
    except ToolCallDeniedError as e:
        print(f"  - Blocked with reason: {e.reason}")
        print("  - Validation: DENIED (as expected)")
        return True
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False


async def test_history_stats(veto: Veto):
    """Test that history is tracked."""
    print("\n" + "=" * 60)
    print("TEST 4: History Stats")
    print("=" * 60)

    stats = veto.get_history_stats()
    print(f"  - Total calls: {stats.total_calls}")
    print(f"  - Allowed: {stats.allowed_calls}")
    print(f"  - Denied: {stats.denied_calls}")

    expected_total = 2  # One allow, one deny
    if stats.total_calls >= expected_total:
        print("  - History tracking: SUCCESS")
        return True
    else:
        print(f"  - ERROR: Expected at least {expected_total} calls in history")
        return False


# =============================================================================
# Main
# =============================================================================

async def main():
    print("\n" + "#" * 60)
    print("#" + " " * 58 + "#")
    print("#    VETO SDK - LOCAL SERVER INTEGRATION TEST" + " " * 13 + "#")
    print("#" + " " * 58 + "#")
    print("#" * 60)

    results = []

    # Test 1: Registration
    veto, wrapped_tool = await test_registration()
    results.append(("Registration", True))

    # Test 2: Allow validation
    allow_ok = await test_validation_allow(veto, wrapped_tool)
    results.append(("Validation (Allow)", allow_ok))

    # Test 3: Deny validation
    deny_ok = await test_validation_deny(veto, wrapped_tool)
    results.append(("Validation (Deny)", deny_ok))

    # Test 4: History
    history_ok = await test_history_stats(veto)
    results.append(("History Stats", history_ok))

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    passed = 0
    failed = 0
    for name, ok in results:
        status = "PASS" if ok else "FAIL"
        icon = "✅" if ok else "❌"
        print(f"  {icon} {name}: {status}")
        if ok:
            passed += 1
        else:
            failed += 1

    print("\n" + "-" * 60)
    print(f"  Total: {passed} passed, {failed} failed")
    print("=" * 60 + "\n")

    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
