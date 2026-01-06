#!/usr/bin/env python3
"""
Treasury Management Agent Example (Python)

Cash flow monitoring with Veto guardrails
alerting on unusual movements and enforcing transfer limits.
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
# Simulated Treasury Data
# =============================================================================

@dataclass
class Account:
    id: str
    name: str
    type: str  # 'operating', 'payroll', 'reserve', 'investment'
    balance: float
    currency: str


@dataclass
class Transfer:
    id: str
    from_account: str
    to_account: str
    amount: float
    status: str
    timestamp: str


ACCOUNTS: dict[str, Account] = {
    'ACC001': Account('ACC001', 'Main Operating', 'operating', 2500000.00, 'USD'),
    'ACC002': Account('ACC002', 'Payroll Account', 'payroll', 850000.00, 'USD'),
    'ACC003': Account('ACC003', 'Emergency Reserve', 'reserve', 5000000.00, 'USD'),
    'ACC004': Account('ACC004', 'Investment Portfolio', 'investment', 12000000.00, 'USD'),
    'ACC005': Account('ACC005', 'International Operations', 'operating', 1200000.00, 'EUR'),
}

TRANSFERS: list[Transfer] = []


# =============================================================================
# Tool Definitions
# =============================================================================

class TreasuryTool:
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    async def handler(self, args: dict[str, Any]) -> str:
        raise NotImplementedError


class GetAccountBalance(TreasuryTool):
    def __init__(self):
        super().__init__("get_account_balance", "Get the current balance of an account.")

    async def handler(self, args: dict[str, Any]) -> str:
        account_id = args.get("account_id")
        account = ACCOUNTS.get(account_id)
        if not account:
            return json.dumps({"error": f"Account {account_id} not found"})
        return json.dumps({
            "account_id": account.id,
            "name": account.name,
            "type": account.type,
            "balance": account.balance,
            "currency": account.currency,
        }, indent=2)


class GetCashPosition(TreasuryTool):
    def __init__(self):
        super().__init__("get_cash_position", "Get overall cash position summary.")

    async def handler(self, args: dict[str, Any]) -> str:
        by_type: dict[str, float] = {}
        for acc in ACCOUNTS.values():
            by_type[acc.type] = by_type.get(acc.type, 0) + acc.balance

        return json.dumps({
            "total_cash": sum(a.balance for a in ACCOUNTS.values()),
            "by_type": by_type,
            "accounts": len(ACCOUNTS),
            "as_of": datetime.now().isoformat(),
        }, indent=2)


class TransferFunds(TreasuryTool):
    def __init__(self):
        super().__init__("transfer_funds", "Transfer funds between accounts.")

    async def handler(self, args: dict[str, Any]) -> str:
        from_id = args.get("from_account")
        to_id = args.get("to_account")
        amount = args.get("amount")

        from_acc = ACCOUNTS.get(from_id)
        to_acc = ACCOUNTS.get(to_id)

        if not from_acc or not to_acc:
            return json.dumps({"error": "Account not found"})

        transfer_id = f"TRF{len(TRANSFERS) + 1:04d}"
        TRANSFERS.append(Transfer(
            transfer_id, from_id, to_id, amount,
            'completed', datetime.now().isoformat()
        ))

        from_acc.balance -= amount
        to_acc.balance += amount

        return json.dumps({
            "success": True,
            "transfer_id": transfer_id,
            "from": from_acc.name,
            "to": to_acc.name,
            "amount": amount,
            "message": f"Transferred ${amount:,.2f}",
        }, indent=2)


class WithdrawFunds(TreasuryTool):
    def __init__(self):
        super().__init__("withdraw_funds", "Withdraw funds from an account.")

    async def handler(self, args: dict[str, Any]) -> str:
        account_id = args.get("account_id")
        amount = args.get("amount")

        account = ACCOUNTS.get(account_id)
        if not account:
            return json.dumps({"error": "Account not found"})

        account.balance -= amount

        return json.dumps({
            "success": True,
            "account": account.name,
            "amount": amount,
            "new_balance": account.balance,
        }, indent=2)


class GetTransactionHistory(TreasuryTool):
    def __init__(self):
        super().__init__("get_transaction_history", "Get recent transfer history.")

    async def handler(self, args: dict[str, Any]) -> str:
        limit = args.get("limit", 10)
        transfers = TRANSFERS[-limit:]
        return json.dumps({
            "transfers": [
                {"id": t.id, "from": t.from_account, "to": t.to_account, "amount": t.amount}
                for t in transfers
            ],
            "count": len(transfers),
        }, indent=2)


TOOLS = [GetAccountBalance(), GetCashPosition(), TransferFunds(),
         WithdrawFunds(), GetTransactionHistory()]


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
    print("         TREASURY MANAGEMENT AGENT EXAMPLE")
    print("      Cash Flow Monitoring with Veto Guardrails")
    print("=" * 70)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("\n[!] Warning: GEMINI_API_KEY not set")

    print("\n[*] Initializing Veto guardrails...")
    veto = await Veto.init()
    print(f"    ✓ Veto initialized ({len(veto._rules.all_rules)} rules)")

    scenarios = [
        {"desc": "Get overall cash position", "tool": "get_cash_position", "args": {}},
        {"desc": "Check operating account balance", "tool": "get_account_balance", "args": {"account_id": "ACC001"}},
        {"desc": "Transfer $50,000 from operating to payroll", "tool": "transfer_funds", "args": {"from_account": "ACC001", "to_account": "ACC002", "amount": 50000, "accountType": "operating", "cfoApproval": False, "international": False}},
        {"desc": "Transfer $200,000 without CFO approval (SHOULD BLOCK)", "tool": "transfer_funds", "args": {"from_account": "ACC001", "to_account": "ACC002", "amount": 200000, "accountType": "operating", "cfoApproval": False, "international": False}},
        {"desc": "Transfer from reserve account (SHOULD BLOCK)", "tool": "transfer_funds", "args": {"from_account": "ACC003", "to_account": "ACC001", "amount": 100000, "accountType": "reserve", "cfoApproval": False, "international": False}},
        {"desc": "International transfer without compliance (SHOULD BLOCK)", "tool": "transfer_funds", "args": {"from_account": "ACC001", "to_account": "ACC005", "amount": 50000, "accountType": "operating", "cfoApproval": False, "international": True, "complianceChecked": False}},
        {"desc": "Get transaction history", "tool": "get_transaction_history", "args": {"limit": 5}},
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
    print(f"Transfers completed: {len(TRANSFERS)}")


if __name__ == "__main__":
    asyncio.run(run_demo())
