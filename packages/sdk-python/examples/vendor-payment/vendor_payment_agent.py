#!/usr/bin/env python3
"""
Vendor Payment Agent Example (Python)

Automated vendor invoice processing with Veto guardrails
enforcing approval workflows and vendor verification.
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from dataclasses import dataclass

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from veto import Veto, ToolCallDeniedError


# =============================================================================
# Simulated Vendor Data
# =============================================================================

@dataclass
class Vendor:
    id: str
    name: str
    status: str  # 'verified', 'pending', 'suspended'
    category: str
    total_paid: float
    payment_terms: int


@dataclass
class Payment:
    id: str
    vendor_id: str
    amount: float
    status: str
    timestamp: str


VENDORS: dict[str, Vendor] = {
    'VND001': Vendor('VND001', 'Office Supplies Pro', 'verified', 'supplies', 45000.00, 30),
    'VND002': Vendor('VND002', 'Tech Solutions LLC', 'verified', 'technology', 125000.00, 15),
    'VND003': Vendor('VND003', 'New Contractor Inc', 'pending', 'services', 0.00, 30),
    'VND004': Vendor('VND004', 'Suspended Services', 'suspended', 'services', 15000.00, 30),
    'VND005': Vendor('VND005', 'Global Logistics', 'verified', 'shipping', 78000.00, 45),
}

PAYMENTS: list[Payment] = []


# =============================================================================
# Tool Definitions
# =============================================================================

class VendorTool:
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    async def handler(self, args: dict[str, Any]) -> str:
        raise NotImplementedError


class GetVendor(VendorTool):
    def __init__(self):
        super().__init__("get_vendor", "Get vendor details by ID.")

    async def handler(self, args: dict[str, Any]) -> str:
        vendor_id = args.get("vendor_id")
        vendor = VENDORS.get(vendor_id)
        if not vendor:
            return json.dumps({"error": f"Vendor {vendor_id} not found"})
        return json.dumps({
            "id": vendor.id,
            "name": vendor.name,
            "status": vendor.status,
            "category": vendor.category,
            "total_paid": vendor.total_paid,
            "payment_terms": vendor.payment_terms,
        }, indent=2)


class ListVendors(VendorTool):
    def __init__(self):
        super().__init__("list_vendors", "List all vendors.")

    async def handler(self, args: dict[str, Any]) -> str:
        status = args.get("status")
        vendors = list(VENDORS.values())
        if status:
            vendors = [v for v in vendors if v.status == status]

        return json.dumps({
            "vendors": [
                {"id": v.id, "name": v.name, "status": v.status}
                for v in vendors
            ],
            "count": len(vendors),
        }, indent=2)


class ProcessPayment(VendorTool):
    def __init__(self):
        super().__init__("process_payment", "Process a payment to a vendor.")

    async def handler(self, args: dict[str, Any]) -> str:
        vendor_id = args.get("vendor_id")
        amount = args.get("amount")

        vendor = VENDORS.get(vendor_id)
        if not vendor:
            return json.dumps({"error": f"Vendor {vendor_id} not found"})

        payment_id = f"PAY{len(PAYMENTS) + 1:04d}"
        PAYMENTS.append(Payment(
            payment_id, vendor_id, amount,
            'completed', datetime.now().isoformat()
        ))

        vendor.total_paid += amount

        return json.dumps({
            "success": True,
            "payment_id": payment_id,
            "vendor": vendor.name,
            "amount": amount,
            "message": f"Payment of ${amount:,.2f} processed to {vendor.name}",
        }, indent=2)


class GetPaymentHistory(VendorTool):
    def __init__(self):
        super().__init__("get_payment_history", "Get payment history for a vendor.")

    async def handler(self, args: dict[str, Any]) -> str:
        vendor_id = args.get("vendor_id")
        payments = [p for p in PAYMENTS if not vendor_id or p.vendor_id == vendor_id]

        return json.dumps({
            "payments": [
                {"id": p.id, "vendor_id": p.vendor_id, "amount": p.amount, "status": p.status}
                for p in payments[-10:]
            ],
            "count": len(payments),
            "total": sum(p.amount for p in payments),
        }, indent=2)


TOOLS = [GetVendor(), ListVendors(), ProcessPayment(), GetPaymentHistory()]


# =============================================================================
# Demo Runner
# =============================================================================

async def simulate_action(veto: Veto, tool_name: str, args: dict) -> tuple[bool, str]:
    tool = next((t for t in TOOLS if t.name == tool_name), None)
    if not tool:
        return False, f"Tool '{tool_name}' not found"

    wrapped = veto.wrap([tool])[0]
    try:
        result = await wrapped.handler(args)
        return True, result
    except ToolCallDeniedError as e:
        return False, f"BLOCKED: {e.reason}"
    except Exception as e:
        return False, f"Error: {str(e)}"


async def run_demo():
    print("\n" + "=" * 70)
    print("         VENDOR PAYMENT AGENT EXAMPLE")
    print("      Approval Workflows with Veto Guardrails")
    print("=" * 70)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("\n[!] Warning: GEMINI_API_KEY not set")

    print("\n[*] Initializing Veto guardrails...")
    veto = await Veto.init()
    print(f"    ✓ Veto initialized ({len(veto._rules.all_rules)} rules)")

    scenarios = [
        {"desc": "List all verified vendors", "tool": "list_vendors", "args": {"status": "verified"}},
        {"desc": "Get details for VND001", "tool": "get_vendor", "args": {"vendor_id": "VND001"}},
        {"desc": "Pay $5,000 to verified vendor VND001 with matching", "tool": "process_payment", "args": {"vendor_id": "VND001", "amount": 5000, "threeWayMatch": True, "directorApproval": False}},
        {"desc": "Pay $15,000 without three-way match (SHOULD BLOCK)", "tool": "process_payment", "args": {"vendor_id": "VND002", "amount": 15000, "threeWayMatch": False, "directorApproval": False}},
        {"desc": "Pay $50,000 without director approval (SHOULD BLOCK)", "tool": "process_payment", "args": {"vendor_id": "VND002", "amount": 50000, "threeWayMatch": True, "directorApproval": False}},
        {"desc": "Pay pending vendor VND003 (SHOULD BLOCK)", "tool": "process_payment", "args": {"vendor_id": "VND003", "amount": 1000, "threeWayMatch": True, "directorApproval": False}},
        {"desc": "Pay suspended vendor VND004 (SHOULD BLOCK)", "tool": "process_payment", "args": {"vendor_id": "VND004", "amount": 500, "threeWayMatch": True, "directorApproval": True}},
        {"desc": "Get payment history", "tool": "get_payment_history", "args": {}},
    ]

    print("\n" + "=" * 70)
    print("         RUNNING SCENARIOS")
    print("=" * 70)

    for i, s in enumerate(scenarios, 1):
        print(f"\n{'─' * 70}")
        print(f"[{i}] {s['desc']}")
        print(f"{'─' * 70}")

        allowed, result = await simulate_action(veto, s["tool"], s["args"])
        icon = "✅ ALLOWED" if allowed else "🛑 BLOCKED"
        print(f"\n{icon}")
        print(f"Output: {result[:250]}..." if len(result) > 250 else f"Output: {result}")

    print("\n" + "=" * 70)
    print("         DEMO COMPLETE")
    print("=" * 70)

    stats = veto.get_history_stats()
    print(f"\nVeto Stats: {stats.total_calls} calls, {stats.allowed_calls} allowed, {stats.denied_calls} denied")
    print(f"Payments processed: {len(PAYMENTS)}")


if __name__ == "__main__":
    asyncio.run(run_demo())
