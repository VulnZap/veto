#!/usr/bin/env python3
"""
Sales Dispute Agent Example (Python)

Automated refund and dispute handling with Veto guardrails
for conditional business rules.
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
# Simulated E-commerce Data
# =============================================================================

@dataclass
class Order:
    id: str
    customer_id: str
    customer_name: str
    items: list[dict[str, Any]]
    total: float
    status: str
    order_date: str
    delivery_date: str | None


@dataclass
class DisputeCase:
    id: str
    order_id: str
    reason: str
    status: str
    resolution: str | None
    refund_amount: float | None
    created_at: str


ORDERS: dict[str, Order] = {
    'ORD001': Order('ORD001', 'CUST001', 'Alice Johnson',
        [{'name': 'Wireless Headphones', 'qty': 1, 'price': 149.99}],
        149.99, 'delivered', '2026-01-01', '2026-01-04'),
    'ORD002': Order('ORD002', 'CUST002', 'Bob Smith',
        [{'name': 'Smart Watch', 'qty': 1, 'price': 299.99}],
        349.97, 'delivered', '2025-12-15', '2025-12-18'),
    'ORD003': Order('ORD003', 'CUST003', 'Carol Williams',
        [{'name': 'Laptop Stand', 'qty': 1, 'price': 89.99}],
        89.99, 'shipped', '2026-01-05', None),
    'ORD004': Order('ORD004', 'CUST004', 'David Brown',
        [{'name': 'Premium Camera', 'qty': 1, 'price': 1299.99}],
        1299.99, 'delivered', '2025-10-01', '2025-10-05'),
    'ORD005': Order('ORD005', 'CUST005', 'Eva Martinez',
        [{'name': 'Bluetooth Speaker', 'qty': 1, 'price': 79.99}],
        79.99, 'delivered', '2026-01-02', '2026-01-05'),
}

DISPUTES: list[DisputeCase] = []


# =============================================================================
# Tool Definitions
# =============================================================================

class SalesDisputeTool:
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    async def handler(self, args: dict[str, Any]) -> str:
        raise NotImplementedError


class LookupOrder(SalesDisputeTool):
    def __init__(self):
        super().__init__("lookup_order", "Look up order details by order ID.")

    async def handler(self, args: dict[str, Any]) -> str:
        order = ORDERS.get(args.get("order_id"))
        if not order:
            return json.dumps({"error": "Order not found"})

        days = None
        if order.delivery_date:
            delivery = datetime.strptime(order.delivery_date, '%Y-%m-%d')
            days = (datetime.now() - delivery).days

        return json.dumps({
            "order_id": order.id,
            "customer": order.customer_name,
            "items": order.items,
            "total": order.total,
            "status": order.status,
            "delivery_date": order.delivery_date,
            "days_since_delivery": days,
        }, indent=2)


class CheckRefundEligibility(SalesDisputeTool):
    def __init__(self):
        super().__init__("check_refund_eligibility", "Check if order is eligible for refund.")

    async def handler(self, args: dict[str, Any]) -> str:
        order = ORDERS.get(args.get("order_id"))
        if not order:
            return json.dumps({"error": "Order not found"})

        eligible = True
        reasons = []

        if order.status != 'delivered':
            eligible = False
            reasons.append(f"Order status is '{order.status}'")

        if order.delivery_date:
            days = (datetime.now() - datetime.strptime(order.delivery_date, '%Y-%m-%d')).days
            if days > 30:
                eligible = False
                reasons.append(f"Delivery was {days} days ago (>30 day limit)")

        return json.dumps({
            "order_id": order.id,
            "eligible": eligible,
            "reasons": reasons if not eligible else ["Meets all criteria"],
            "order_total": order.total,
        }, indent=2)


class ProcessRefund(SalesDisputeTool):
    def __init__(self):
        super().__init__("process_refund", "Process a refund for an eligible order.")

    async def handler(self, args: dict[str, Any]) -> str:
        order = ORDERS.get(args.get("order_id"))
        if not order:
            return json.dumps({"error": "Order not found"})

        dispute_id = f"DSP{len(DISPUTES) + 1:04d}"
        DISPUTES.append(DisputeCase(
            dispute_id, order.id, args.get("reason", ""),
            'resolved', 'refund_processed', args.get("amount"),
            datetime.now().isoformat()
        ))

        return json.dumps({
            "success": True,
            "dispute_id": dispute_id,
            "customer": order.customer_name,
            "refund_amount": args.get("amount"),
            "message": f"Refund of ${args.get('amount'):.2f} processed",
        }, indent=2)


class EscalateToHuman(SalesDisputeTool):
    def __init__(self):
        super().__init__("escalate_to_human", "Escalate dispute to human support.")

    async def handler(self, args: dict[str, Any]) -> str:
        order = ORDERS.get(args.get("order_id"))
        if not order:
            return json.dumps({"error": "Order not found"})

        dispute_id = f"DSP{len(DISPUTES) + 1:04d}"
        DISPUTES.append(DisputeCase(
            dispute_id, order.id, args.get("reason", ""),
            'escalated', None, None, datetime.now().isoformat()
        ))

        return json.dumps({
            "success": True,
            "dispute_id": dispute_id,
            "status": "escalated",
            "priority": args.get("priority", "normal"),
            "assigned_to": "human_support_team",
        }, indent=2)


class DenyRefund(SalesDisputeTool):
    def __init__(self):
        super().__init__("deny_refund", "Deny a refund request with explanation.")

    async def handler(self, args: dict[str, Any]) -> str:
        order = ORDERS.get(args.get("order_id"))
        if not order:
            return json.dumps({"error": "Order not found"})

        dispute_id = f"DSP{len(DISPUTES) + 1:04d}"
        DISPUTES.append(DisputeCase(
            dispute_id, order.id, "Customer request",
            'denied', args.get("reason"), None, datetime.now().isoformat()
        ))

        return json.dumps({
            "success": True,
            "dispute_id": dispute_id,
            "status": "denied",
            "reason": args.get("reason"),
        }, indent=2)


class GetDisputeHistory(SalesDisputeTool):
    def __init__(self):
        super().__init__("get_dispute_history", "Get previous dispute cases.")

    async def handler(self, args: dict[str, Any]) -> str:
        return json.dumps({
            "disputes": [
                {"id": d.id, "order_id": d.order_id, "status": d.status, "refund": d.refund_amount}
                for d in DISPUTES
            ],
            "total": len(DISPUTES),
        }, indent=2)


TOOLS = [LookupOrder(), CheckRefundEligibility(), ProcessRefund(),
         EscalateToHuman(), DenyRefund(), GetDisputeHistory()]


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
    print("         SALES DISPUTE AGENT EXAMPLE")
    print("      Automated Refund Handling with Veto")
    print("=" * 70)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("\n[!] Warning: GEMINI_API_KEY not set")

    print("\n[*] Initializing Veto guardrails...")
    veto = await Veto.init()
    print(f"    ✓ Veto initialized ({len(veto._rules.all_rules)} rules)")

    scenarios = [
        {"desc": "Lookup order ORD001", "tool": "lookup_order", "args": {"order_id": "ORD001"}},
        {"desc": "Check refund eligibility for ORD001", "tool": "check_refund_eligibility", "args": {"order_id": "ORD001"}},
        {"desc": "Process $149.99 refund for ORD001", "tool": "process_refund", "args": {"order_id": "ORD001", "amount": 149.99, "reason": "Defective"}},
        {"desc": "Process $500 refund for ORD005 (SHOULD BLOCK - exceeds order)", "tool": "process_refund", "args": {"order_id": "ORD005", "amount": 500.00, "reason": "Unhappy"}},
        {"desc": "Process refund for ORD004 (SHOULD BLOCK - expired)", "tool": "process_refund", "args": {"order_id": "ORD004", "amount": 1299.99, "reason": "Changed mind"}},
        {"desc": "Escalate ORD002 dispute", "tool": "escalate_to_human", "args": {"order_id": "ORD002", "reason": "Wrong item", "priority": "high"}},
        {"desc": "Deny refund for ORD003 (not delivered)", "tool": "deny_refund", "args": {"order_id": "ORD003", "reason": "Order still shipping"}},
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
        print(f"Output: {result[:300]}..." if len(result) > 300 else f"Output: {result}")

    print("\n" + "=" * 70)
    print("         DEMO COMPLETE")
    print("=" * 70)
    
    stats = veto.get_history_stats()
    print(f"\nVeto Stats: {stats.total_calls} calls, {stats.allowed_calls} allowed, {stats.denied_calls} denied")
    print(f"Disputes processed: {len(DISPUTES)}")


if __name__ == "__main__":
    asyncio.run(run_demo())
