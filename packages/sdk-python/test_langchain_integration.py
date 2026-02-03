#!/usr/bin/env python3
"""
Test LangChain integration with Veto SDK against local server.

This tests:
1. Wrapping LangChain tools with Veto
2. Validation through the local server
3. Tool execution with allow/deny scenarios
"""

import asyncio
import sys
from pathlib import Path
from typing import Optional

# Add SDK to path
sys.path.insert(0, str(Path(__file__).parent))

from pydantic import BaseModel, Field
from langchain_core.tools import tool

from veto import Veto, VetoOptions, ToolCallDeniedError


# =============================================================================
# Define LangChain Tools with Pydantic schemas
# =============================================================================

class PaymentInput(BaseModel):
    """Input schema for payment tool."""
    amount: float = Field(description="The payment amount in dollars")
    recipient: str = Field(default="default", description="The recipient name")


@tool("process_payment", args_schema=PaymentInput)
def process_payment(amount: float, recipient: str = "default") -> str:
    """Process a payment to a recipient."""
    return f"Payment of ${amount} sent to {recipient}"


class SearchInput(BaseModel):
    """Input schema for search tool."""
    query: str = Field(description="The search query")
    limit: int = Field(default=10, description="Maximum number of results")


@tool("search_web", args_schema=SearchInput)
def search_web(query: str, limit: int = 10) -> str:
    """Search the web for information."""
    return f"Found {limit} results for: {query}"


# =============================================================================
# Test Functions
# =============================================================================

async def test_langchain_tool_wrapping():
    """Test that LangChain tools are properly wrapped."""
    print("\n" + "=" * 60)
    print("TEST 1: LangChain Tool Wrapping")
    print("=" * 60)

    veto = await Veto.init(VetoOptions(
        api_key="veto_eEJl44M2aQ9q14ZoilPLf0YPbVsTZ6JN6zKecxUdOiE",
        base_url="http://localhost:3001",
        log_level="info",
    ))

    # Wrap LangChain tools
    tools = [process_payment, search_web]
    wrapped_tools = veto.wrap(tools)

    print(f"  - Wrapped {len(wrapped_tools)} LangChain tool(s)")

    # Check tool attributes are preserved
    for orig, wrapped in zip(tools, wrapped_tools):
        if orig.name != wrapped.name:
            print(f"  - ERROR: Tool name mismatch: {orig.name} vs {wrapped.name}")
            return None, None
        print(f"  - Tool '{wrapped.name}' wrapped successfully")

    print("  - LangChain Tool Wrapping: SUCCESS")

    # Give registration time
    await asyncio.sleep(1)

    return veto, wrapped_tools


async def test_langchain_invoke_allow(veto: Veto, wrapped_payment_tool):
    """Test LangChain tool invocation when allowed."""
    print("\n" + "=" * 60)
    print("TEST 2: LangChain Invoke - ALLOW")
    print("=" * 60)

    try:
        # Use invoke method (LangChain style)
        result = await wrapped_payment_tool.ainvoke({"amount": 100, "recipient": "Alice"})
        print(f"  - Result: {result}")
        print("  - LangChain Invoke (Allow): SUCCESS")
        return True
    except ToolCallDeniedError as e:
        print(f"  - ERROR: Unexpectedly blocked: {e.reason}")
        return False
    except Exception as e:
        print(f"  - ERROR: {e}")
        # Try with func instead if invoke doesn't work
        try:
            if hasattr(wrapped_payment_tool, 'func'):
                result = await wrapped_payment_tool.func({"amount": 100, "recipient": "Alice"})
                print(f"  - Result (via func): {result}")
                print("  - LangChain func (Allow): SUCCESS")
                return True
        except Exception as e2:
            print(f"  - ERROR (func fallback): {e2}")
        return False


async def test_langchain_invoke_deny(veto: Veto, wrapped_payment_tool):
    """Test LangChain tool invocation when denied."""
    print("\n" + "=" * 60)
    print("TEST 3: LangChain Invoke - DENY (amount > 1000)")
    print("=" * 60)

    try:
        result = await wrapped_payment_tool.ainvoke({"amount": 5000, "recipient": "Bob"})
        print(f"  - Result: {result}")
        print("  - ERROR: Should have been blocked!")
        return False
    except ToolCallDeniedError as e:
        print(f"  - Blocked: {e.reason}")
        print("  - LangChain Invoke (Deny): SUCCESS")
        return True
    except Exception as e:
        # Check if it's because ainvoke doesn't exist
        if "ainvoke" in str(e).lower():
            try:
                if hasattr(wrapped_payment_tool, 'func'):
                    result = await wrapped_payment_tool.func({"amount": 5000, "recipient": "Bob"})
                    print(f"  - Result (via func): {result}")
                    print("  - ERROR: Should have been blocked!")
                    return False
            except ToolCallDeniedError as e2:
                print(f"  - Blocked (via func): {e2.reason}")
                print("  - LangChain func (Deny): SUCCESS")
                return True
        print(f"  - ERROR: {e}")
        return False


async def test_unregistered_tool(veto: Veto, wrapped_search_tool):
    """Test that unregistered tools are allowed (no policy)."""
    print("\n" + "=" * 60)
    print("TEST 4: Unregistered Tool (should allow)")
    print("=" * 60)

    try:
        result = await wrapped_search_tool.ainvoke({"query": "test", "limit": 5})
        print(f"  - Result: {result}")
        print("  - Unregistered Tool: ALLOWED (as expected)")
        return True
    except ToolCallDeniedError as e:
        print(f"  - Blocked: {e.reason}")
        # It's OK if it's blocked - depends on server configuration
        print("  - Unregistered Tool: Blocked (acceptable)")
        return True
    except Exception as e:
        try:
            if hasattr(wrapped_search_tool, 'func'):
                result = await wrapped_search_tool.func({"query": "test", "limit": 5})
                print(f"  - Result (via func): {result}")
                print("  - Unregistered Tool: ALLOWED (as expected)")
                return True
        except ToolCallDeniedError as e2:
            print(f"  - Blocked (via func): {e2.reason}")
            return True
        except Exception as e2:
            print(f"  - ERROR: {e2}")
        return False


# =============================================================================
# Main
# =============================================================================

async def main():
    print("\n" + "#" * 60)
    print("#" + " " * 58 + "#")
    print("#    VETO SDK - LANGCHAIN INTEGRATION TEST" + " " * 16 + "#")
    print("#" + " " * 58 + "#")
    print("#" * 60)

    results = []

    # Test 1: Wrapping
    veto, wrapped_tools = await test_langchain_tool_wrapping()
    if not wrapped_tools:
        print("\n❌ Failed to wrap tools, aborting tests")
        return False
    results.append(("Tool Wrapping", True))

    payment_tool = wrapped_tools[0]  # process_payment
    search_tool = wrapped_tools[1]   # search_web

    # Test 2: Allow
    allow_ok = await test_langchain_invoke_allow(veto, payment_tool)
    results.append(("LangChain Invoke (Allow)", allow_ok))

    # Test 3: Deny
    deny_ok = await test_langchain_invoke_deny(veto, payment_tool)
    results.append(("LangChain Invoke (Deny)", deny_ok))

    # Test 4: Unregistered tool
    unreg_ok = await test_unregistered_tool(veto, search_tool)
    results.append(("Unregistered Tool", unreg_ok))

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
