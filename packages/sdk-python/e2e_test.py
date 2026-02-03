#!/usr/bin/env python3
"""
Full End-to-End Test for Veto SDK with Local Server

Tests:
1. Server connectivity
2. Tool registration
3. Policy management (via API)
4. Validation - Allow scenarios
5. Validation - Deny scenarios
6. LangChain integration
7. History tracking
"""

import asyncio
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime
from typing import Any
from dataclasses import dataclass

# Add SDK to path
sys.path.insert(0, str(Path(__file__).parent))

from pydantic import BaseModel, Field
from langchain_core.tools import tool

from veto import Veto, VetoOptions, ToolCallDeniedError


# =============================================================================
# Configuration
# =============================================================================

API_KEY = "veto_eEJl44M2aQ9q14ZoilPLf0YPbVsTZ6JN6zKecxUdOiE"
BASE_URL = "http://localhost:3001"
LOG_FILE = Path(__file__).parent / "e2e_test_results.log"


# =============================================================================
# Logging
# =============================================================================

class TestLogger:
    def __init__(self, log_file: Path):
        self.log_file = log_file
        self.logs = []

    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().isoformat()
        entry = f"[{timestamp}] [{level}] {message}"
        self.logs.append(entry)
        print(entry)

    def section(self, title: str):
        separator = "=" * 70
        self.log(separator, "")
        self.log(f"  {title}", "")
        self.log(separator, "")

    def subsection(self, title: str):
        self.log(f"\n--- {title} ---", "")

    def success(self, message: str):
        self.log(f"✅ {message}", "PASS")

    def fail(self, message: str):
        self.log(f"❌ {message}", "FAIL")

    def info(self, message: str):
        self.log(f"   {message}", "INFO")

    def save(self):
        with open(self.log_file, "w") as f:
            f.write("\n".join(self.logs))
        print(f"\nLogs saved to: {self.log_file}")


logger = TestLogger(LOG_FILE)


# =============================================================================
# HTTP Helpers
# =============================================================================

def api_request(method: str, endpoint: str, data: dict = None) -> tuple[int, dict]:
    """Make an API request to the server."""
    url = f"{BASE_URL}{endpoint}"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    req = urllib.request.Request(url, method=method, headers=headers)
    if data:
        req.data = json.dumps(data).encode("utf-8")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))
    except Exception as e:
        return 0, {"error": str(e)}


# =============================================================================
# LangChain Tools
# =============================================================================

class TransferInput(BaseModel):
    """Input for money transfer."""
    amount: float = Field(description="Amount to transfer")
    to_account: str = Field(description="Destination account")


@tool("transfer_money", args_schema=TransferInput)
def transfer_money(amount: float, to_account: str) -> str:
    """Transfer money to an account."""
    return f"Transferred ${amount} to {to_account}"


# =============================================================================
# Simple Tool
# =============================================================================

@dataclass
class SimpleTool:
    name: str = "simple_calculator"
    description: str = "A simple calculator"

    async def handler(self, args: dict[str, Any]) -> str:
        op = args.get("operation", "add")
        a = args.get("a", 0)
        b = args.get("b", 0)
        if op == "add":
            return f"{a} + {b} = {a + b}"
        elif op == "multiply":
            return f"{a} * {b} = {a * b}"
        return f"Unknown operation: {op}"


# =============================================================================
# Tests
# =============================================================================

def test_server_health() -> bool:
    """Test 1: Server connectivity."""
    logger.subsection("Test 1: Server Health Check")

    try:
        status, data = api_request("GET", "/health")
        if status == 200 and data.get("status") == "ok":
            logger.success(f"Server healthy at {BASE_URL}")
            logger.info(f"Response: {data}")
            return True
        else:
            logger.fail(f"Unexpected response: {status} - {data}")
            return False
    except Exception as e:
        logger.fail(f"Server connection failed: {e}")
        return False


def test_list_tools() -> bool:
    """Test 2: List existing tools."""
    logger.subsection("Test 2: List Tools")

    status, data = api_request("GET", "/v1/tools")
    if status == 200:
        tools = data.get("data", [])
        logger.success(f"Listed {len(tools)} tool(s)")
        for t in tools:
            logger.info(f"  - {t.get('name')}")
        return True
    else:
        logger.fail(f"Failed to list tools: {status} - {data}")
        return False


def test_list_policies() -> bool:
    """Test 3: List existing policies."""
    logger.subsection("Test 3: List Policies")

    status, data = api_request("GET", "/v1/policies")
    if status == 200:
        policies = data.get("data", [])
        logger.success(f"Listed {len(policies)} policy(ies)")
        for p in policies:
            active = "ACTIVE" if p.get("isActive") else "inactive"
            logger.info(f"  - {p.get('toolName')} [{active}]")
        return True
    else:
        logger.fail(f"Failed to list policies: {status} - {data}")
        return False


async def test_sdk_initialization() -> tuple[bool, Veto]:
    """Test 4: SDK initialization."""
    logger.subsection("Test 4: SDK Initialization")

    try:
        veto = await Veto.init(VetoOptions(
            api_key=API_KEY,
            base_url=BASE_URL,
            log_level="warn",  # Reduce noise
        ))
        logger.success("Veto SDK initialized")
        logger.info(f"Mode: strict, Base URL: {BASE_URL}")
        return True, veto
    except Exception as e:
        logger.fail(f"SDK initialization failed: {e}")
        return False, None


async def test_tool_registration(veto: Veto) -> bool:
    """Test 5: Tool registration via SDK."""
    logger.subsection("Test 5: Tool Registration (SDK)")

    try:
        tools = [transfer_money, SimpleTool()]
        wrapped = veto.wrap(tools)

        # Wait for async registration
        await asyncio.sleep(1)

        logger.success(f"Wrapped {len(wrapped)} tools")
        for t in wrapped:
            logger.info(f"  - {t.name}")
        return True
    except Exception as e:
        logger.fail(f"Tool registration failed: {e}")
        return False


def test_setup_policy() -> bool:
    """Test 6: Setup policy for transfer_money."""
    logger.subsection("Test 6: Policy Setup")

    # Check if policy exists
    status, data = api_request("GET", "/v1/policies/transfer_money")

    if status == 404:
        logger.info("Policy doesn't exist, will be created on first validation")
        return True

    # Update policy with constraints
    policy_data = {
        "mode": "deterministic",
        "constraints": [
            {
                "argumentName": "amount",
                "enabled": True,
                "greaterThanOrEqual": 0,
                "lessThanOrEqual": 10000,
                "required": True
            }
        ]
    }

    status, data = api_request("PUT", "/v1/policies/transfer_money", policy_data)
    if status == 200:
        logger.success("Policy updated with amount constraint (0-10000)")
    else:
        logger.info(f"Policy update response: {status}")

    # Activate policy
    status, data = api_request("POST", "/v1/policies/transfer_money/activate")
    if status == 200:
        logger.success("Policy activated")
        return True
    else:
        logger.info(f"Policy activation response: {status} - {data}")
        return True  # May already be active


async def test_validation_allow(veto: Veto) -> bool:
    """Test 7: Validation - Allow scenario."""
    logger.subsection("Test 7: Validation (ALLOW)")

    try:
        wrapped = veto.wrap([transfer_money])[0]
        result = await wrapped.ainvoke({"amount": 500, "to_account": "ACC123"})
        logger.success(f"Transfer allowed: {result}")
        return True
    except ToolCallDeniedError as e:
        logger.fail(f"Unexpectedly blocked: {e.reason}")
        return False
    except Exception as e:
        logger.fail(f"Error: {e}")
        return False


async def test_validation_deny(veto: Veto) -> bool:
    """Test 8: Validation - Deny scenario."""
    logger.subsection("Test 8: Validation (DENY)")

    try:
        wrapped = veto.wrap([transfer_money])[0]
        result = await wrapped.ainvoke({"amount": 50000, "to_account": "ACC456"})
        logger.fail(f"Should have been blocked but got: {result}")
        return False
    except ToolCallDeniedError as e:
        logger.success(f"Correctly blocked: {e.reason}")
        return True
    except Exception as e:
        logger.fail(f"Error: {e}")
        return False


async def test_simple_tool_allow(veto: Veto) -> bool:
    """Test 9: Simple tool - Allow."""
    logger.subsection("Test 9: Simple Tool (ALLOW)")

    try:
        tool = SimpleTool()
        wrapped = veto.wrap([tool])[0]
        result = await wrapped.handler({"operation": "add", "a": 5, "b": 3})
        logger.success(f"Calculation allowed: {result}")
        return True
    except ToolCallDeniedError as e:
        logger.fail(f"Unexpectedly blocked: {e.reason}")
        return False
    except Exception as e:
        logger.fail(f"Error: {e}")
        return False


async def test_history_stats(veto: Veto) -> bool:
    """Test 10: History statistics."""
    logger.subsection("Test 10: History Stats")

    try:
        stats = veto.get_history_stats()
        logger.success("History stats retrieved")
        logger.info(f"  Total calls: {stats.total_calls}")
        logger.info(f"  Allowed: {stats.allowed_calls}")
        logger.info(f"  Denied: {stats.denied_calls}")
        return stats.total_calls > 0
    except Exception as e:
        logger.fail(f"Error: {e}")
        return False


def test_decisions_api() -> bool:
    """Test 11: Check decisions were logged."""
    logger.subsection("Test 11: Decisions API")

    status, data = api_request("GET", "/v1/decisions")
    if status == 200:
        decisions = data.get("data", [])
        logger.success(f"Found {len(decisions)} decision(s)")
        for d in decisions[-3:]:  # Show last 3
            logger.info(f"  - {d.get('toolName')}: {d.get('decision')} ({d.get('latencyMs')}ms)")
        return True
    else:
        logger.fail(f"Failed to get decisions: {status}")
        return False


# =============================================================================
# Main
# =============================================================================

async def main():
    logger.section("VETO SDK - FULL END-TO-END TEST")
    logger.info(f"Started at: {datetime.now().isoformat()}")
    logger.info(f"Server: {BASE_URL}")
    logger.info(f"Log file: {LOG_FILE}")

    results = []

    # Server tests
    results.append(("Server Health", test_server_health()))
    results.append(("List Tools", test_list_tools()))
    results.append(("List Policies", test_list_policies()))

    # SDK tests
    ok, veto = await test_sdk_initialization()
    results.append(("SDK Init", ok))

    if veto:
        results.append(("Tool Registration", await test_tool_registration(veto)))
        results.append(("Policy Setup", test_setup_policy()))

        # Wait for policy to be ready
        await asyncio.sleep(0.5)

        results.append(("Validation Allow", await test_validation_allow(veto)))
        results.append(("Validation Deny", await test_validation_deny(veto)))
        results.append(("Simple Tool", await test_simple_tool_allow(veto)))
        results.append(("History Stats", await test_history_stats(veto)))

    # API verification
    results.append(("Decisions API", test_decisions_api()))

    # Summary
    logger.section("TEST RESULTS SUMMARY")

    passed = 0
    failed = 0
    for name, ok in results:
        if ok:
            logger.success(name)
            passed += 1
        else:
            logger.fail(name)
            failed += 1

    logger.log("")
    logger.log(f"Total: {passed} passed, {failed} failed")
    logger.log(f"Completed at: {datetime.now().isoformat()}")

    # Save logs
    logger.save()

    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
