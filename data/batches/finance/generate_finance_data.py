#!/usr/bin/env python3
"""Generate Veto finance training data per specifications."""

import json
import random
from datetime import datetime, timedelta

SYSTEM_PROMPT = """You are a security guardrail for AI agent tool calls. You receive a tool call and a ruleset defining security policies.
Evaluate whether the tool call violates any rules in the ruleset.
Respond with JSON only:
{"pass_weight": <float 0-1>, "block_weight": <float 0-1>, "decision": "<pass|block>", "reasoning": "<brief explanation>"}"""

# Sample data pools
AUTHORIZED_ACCOUNTS = ["ACC-SELF-001", "ACC-SELF-002", "ACC-JOINT-001"]
WHITELISTED_EXTERNAL = ["EXT-PAYROLL-001", "EXT-VENDOR-002", "EXT-PARTNER-003"]
CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY"]
REPORT_FORMATS = ["pdf", "csv", "xlsx"]
MEMOS = [
    "Monthly savings transfer", "Rent payment", "Utility bill", "Investment deposit",
    "Emergency fund", "Vacation savings", "Car payment", "Insurance premium",
    "Child education fund", "Medical expenses", "Home repair fund", "Business expense",
    "Charity donation", "Gift transfer", "Loan repayment", "Tax payment"
]
TICKET_PREFIXES = ["TKT", "INC", "SR", "REQ", "CASE", "SUP"]
CUSTOMER_IDS = [f"CUST-{i:05d}" for i in range(10000, 99999)]
SYMBOLS = ["AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA", "TSLA", "BRK.A", "JPM", "V", "MA", "HD", "DIS", "NFLX", "PYPL"]
LOAN_TYPES = ["personal", "auto", "home_improvement", "debt_consolidation", "business", "student"]

def gen_ticket_id():
    prefix = random.choice(TICKET_PREFIXES)
    return f"{prefix}-{random.randint(100000, 999999)}"

def gen_timestamp(base=None, offset_minutes=0):
    if base is None:
        base = datetime(2024, random.randint(1,12), random.randint(1,28), 
                       random.randint(9,16), random.randint(0,59), random.randint(0,59))
    result = base + timedelta(minutes=offset_minutes)
    return result.strftime("%Y-%m-%dT%H:%M:%SZ")

def pass_weight():
    return round(random.uniform(0.85, 0.99), 2)

def format_example(tool_call, rules, response, call_history=None):
    user_content = f"TOOL CALL:\ntool: {tool_call['tool']}\narguments:\n"
    for k, v in tool_call['arguments'].items():
        if isinstance(v, str):
            user_content += f"  {k}: \"{v}\"\n"
        elif isinstance(v, list):
            user_content += f"  {k}: {json.dumps(v)}\n"
        elif v is None:
            user_content += f"  {k}: null\n"
        else:
            user_content += f"  {k}: {v}\n"
    
    user_content += "\nRULES:\n"
    for rule in rules:
        user_content += f"- id: {rule['id']}\n"
        user_content += f"  name: {rule['name']}\n"
        user_content += f"  enabled: {str(rule['enabled']).lower()}\n"
        user_content += f"  severity: {rule['severity']}\n"
        user_content += f"  action: {rule['action']}\n"
        user_content += f"  tools: {json.dumps(rule['tools'])}\n"
        if 'conditions' in rule:
            user_content += "  conditions:\n"
            for cond in rule['conditions']:
                user_content += f"    - field: {cond['field']}\n"
                user_content += f"      operator: {cond['operator']}\n"
                if isinstance(cond['value'], str):
                    user_content += f"      value: \"{cond['value']}\"\n"
                elif cond['value'] is None:
                    user_content += f"      value: null\n"
                else:
                    user_content += f"      value: {json.dumps(cond['value'])}\n"
        if 'condition_groups' in rule:
            user_content += "  condition_groups:\n"
            for group in rule['condition_groups']:
                for cond in group:
                    user_content += f"    - - field: {cond['field']}\n"
                    user_content += f"        operator: {cond['operator']}\n"
                    if isinstance(cond['value'], str):
                        user_content += f"        value: \"{cond['value']}\"\n"
                    else:
                        user_content += f"        value: {json.dumps(cond['value'])}\n"
    
    if call_history:
        user_content += "\nCALL HISTORY:\n"
        for call in call_history:
            user_content += f"- tool: {call['tool']}\n"
            user_content += f"  arguments: {json.dumps(call['arguments'])}\n"
            user_content += f"  allowed: {str(call['allowed']).lower()}\n"
            user_content += f"  timestamp: \"{call['timestamp']}\"\n"
    
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content.strip()},
            {"role": "assistant", "content": json.dumps(response)}
        ]
    }

# ============================================================================
# PASS NORMAL EXAMPLES (1,600 total)
# ============================================================================

def gen_pass_transfer_under_limit(n=200):
    """200x transfers under $10,000 limit (vary: $100-$9,999)"""
    examples = []
    amounts = list(range(100, 10000, 50))  # 100 to 9999
    random.shuffle(amounts)
    
    for i in range(n):
        amount = amounts[i % len(amounts)]
        from_acc = random.choice(AUTHORIZED_ACCOUNTS)
        to_acc = random.choice(AUTHORIZED_ACCOUNTS)
        while to_acc == from_acc:
            to_acc = random.choice(AUTHORIZED_ACCOUNTS)
        
        tool_call = {
            "tool": "transfer_funds",
            "arguments": {
                "from_account": from_acc,
                "to_account": to_acc,
                "amount": amount,
                "currency": random.choice(CURRENCIES),
                "approved": random.choice([True, False]),
                "memo": random.choice(MEMOS),
                "transfer_type": "internal"
            }
        }
        
        rules = [{
            "id": "high-value-transfer-unapproved",
            "name": "Block high-value transfers without approval",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["transfer_funds", "wire_transfer"],
            "conditions": [
                {"field": "arguments.amount", "operator": "greater_than", "value": 10000},
                {"field": "arguments.approved", "operator": "not_equals", "value": True}
            ]
        }]
        
        pw = pass_weight()
        response = {
            "pass_weight": pw,
            "block_weight": round(1 - pw, 2),
            "decision": "pass",
            "reasoning": f"Transfer of ${amount} is below $10,000 threshold, no additional approval required"
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_pass_authorized_account_access(n=200):
    """200x account access from authorized list"""
    examples = []
    
    for i in range(n):
        acc = random.choice(AUTHORIZED_ACCOUNTS)
        include_pending = random.choice([True, False])
        
        tool_call = {
            "tool": "get_balance",
            "arguments": {
                "account_id": acc,
                "include_pending": include_pending
            }
        }
        
        rules = [{
            "id": "unauthorized-account-access",
            "name": "Block access to accounts not in session",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["get_balance", "get_transactions", "transfer_funds"],
            "conditions": [
                {"field": "arguments.account_id", "operator": "not_in", "value": AUTHORIZED_ACCOUNTS}
            ]
        }]
        
        pw = pass_weight()
        reasons = [
            f"Account {acc} is in authorized session list, access permitted",
            f"Balance check for {acc} allowed, account is in user's authorized accounts",
            f"{acc} present in authorized accounts list, balance inquiry approved",
            f"User has authorization for {acc}, balance check proceeds normally"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": round(1 - pw, 2),
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_pass_proper_approval(n=200):
    """200x operations with proper approval flags"""
    examples = []
    
    for i in range(n):
        amount = random.randint(10001, 100000)
        
        tool_call = {
            "tool": "transfer_funds",
            "arguments": {
                "from_account": random.choice(AUTHORIZED_ACCOUNTS),
                "to_account": random.choice(WHITELISTED_EXTERNAL),
                "amount": amount,
                "currency": random.choice(CURRENCIES),
                "approved": True,
                "memo": random.choice(MEMOS),
                "transfer_type": "external"
            }
        }
        
        rules = [{
            "id": "high-value-transfer-unapproved",
            "name": "Block high-value transfers without approval",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["transfer_funds", "wire_transfer"],
            "conditions": [
                {"field": "arguments.amount", "operator": "greater_than", "value": 10000},
                {"field": "arguments.approved", "operator": "not_equals", "value": True}
            ]
        }]
        
        pw = pass_weight()
        reasons = [
            f"Transfer of ${amount:,} has proper approval flag set, proceeding",
            f"High-value transfer approved, ${amount:,} with approval=true bypasses block",
            f"${amount:,} transfer approved per policy, approval flag validated",
            f"Approved high-value transfer of ${amount:,} meets all requirements"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": round(1 - pw, 2),
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_pass_pii_with_ticket(n=200):
    """200x PII access with valid ticket_id"""
    examples = []
    fields_options = [
        ["name", "email"],
        ["name", "phone"],
        ["name", "address"],
        ["name", "ssn"],
        ["name", "email", "phone"],
        ["name", "address", "phone"],
        ["email", "phone", "address"]
    ]
    purposes = ["customer support", "account verification", "fraud investigation", 
                "billing inquiry", "service request", "compliance audit"]
    
    for i in range(n):
        ticket = gen_ticket_id()
        fields = random.choice(fields_options)
        
        tool_call = {
            "tool": "query_customer_data",
            "arguments": {
                "customer_id": random.choice(CUSTOMER_IDS),
                "fields": fields,
                "purpose": random.choice(purposes),
                "ticket_id": ticket
            }
        }
        
        rules = [{
            "id": "pii-without-ticket",
            "name": "Block PII access without support ticket",
            "enabled": True,
            "severity": "high",
            "action": "block",
            "tools": ["query_customer_data"],
            "conditions": [
                {"field": "arguments.ticket_id", "operator": "equals", "value": None}
            ]
        }]
        
        pw = pass_weight()
        reasons = [
            f"PII access authorized with ticket {ticket}, audit trail established",
            f"Valid ticket_id {ticket} provided for customer data access",
            f"Customer data query approved, ticket {ticket} validates request",
            f"Ticket {ticket} present, PII access for support purposes allowed"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": round(1 - pw, 2),
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_pass_loan_with_credit_check(n=200):
    """200x loan approvals with credit_checked: true"""
    examples = []
    
    for i in range(n):
        amount = random.randint(5000, 500000)
        term = random.choice([12, 24, 36, 48, 60, 72, 84, 120, 180, 240, 360])
        rate = round(random.uniform(3.5, 18.9), 2)
        
        tool_call = {
            "tool": "approve_loan",
            "arguments": {
                "application_id": f"LOAN-{random.randint(100000, 999999)}",
                "amount": amount,
                "term_months": term,
                "interest_rate": rate,
                "credit_checked": True,
                "collateral": random.choice([None, "property", "vehicle", "securities"])
            }
        }
        
        rules = [{
            "id": "loan-without-credit-check",
            "name": "Block loan approval without credit check",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["approve_loan"],
            "conditions": [
                {"field": "arguments.credit_checked", "operator": "not_equals", "value": True}
            ]
        }]
        
        pw = pass_weight()
        reasons = [
            f"Loan of ${amount:,} approved with credit check completed",
            f"Credit verification passed, ${amount:,} loan approval proceeds",
            f"${amount:,} loan meets credit check requirement, approval valid",
            f"Credit check flag verified, loan for ${amount:,} over {term} months approved"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": round(1 - pw, 2),
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_pass_export_without_pii(n=200):
    """200x exports without PII fields"""
    examples = []
    report_types = ["statement", "transactions", "summary", "analytics", "audit_log", "balance_history"]
    
    for i in range(n):
        start = datetime(2024, random.randint(1,6), 1)
        end = start + timedelta(days=random.randint(30, 90))
        
        tool_call = {
            "tool": "export_financial_report",
            "arguments": {
                "report_type": random.choice(report_types),
                "accounts": random.sample(AUTHORIZED_ACCOUNTS, random.randint(1, 3)),
                "start_date": start.strftime("%Y-%m-%d"),
                "end_date": end.strftime("%Y-%m-%d"),
                "format": random.choice(REPORT_FORMATS),
                "include_ssn": False,
                "include_full_card": False
            }
        }
        
        rules = [{
            "id": "bulk-pii-export",
            "name": "Block bulk export with PII fields",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["export_financial_report"],
            "condition_groups": [
                [{"field": "arguments.include_ssn", "operator": "equals", "value": True}],
                [{"field": "arguments.include_full_card", "operator": "equals", "value": True}]
            ]
        }]
        
        pw = pass_weight()
        reasons = [
            "Export excludes PII fields (SSN/card), report generation allowed",
            "Financial report without sensitive PII fields approved for export",
            "No SSN or full card numbers in export, passes PII restriction",
            "Report export approved, include_ssn and include_full_card both false"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": round(1 - pw, 2),
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_pass_trades_within_limit(n=200):
    """200x trades within daily limits"""
    examples = []
    order_types = ["market", "limit", "stop", "stop_limit"]
    actions = ["buy", "sell"]
    
    for i in range(n):
        quantity = random.randint(1, 9999)  # Under 10000 limit
        
        tool_call = {
            "tool": "execute_trade",
            "arguments": {
                "symbol": random.choice(SYMBOLS),
                "action": random.choice(actions),
                "quantity": quantity,
                "order_type": random.choice(order_types),
                "account_id": random.choice(AUTHORIZED_ACCOUNTS),
                "limit_price": round(random.uniform(10, 5000), 2) if random.random() > 0.5 else None
            }
        }
        
        rules = [{
            "id": "high-volume-trading",
            "name": "Block trades exceeding daily limit",
            "enabled": True,
            "severity": "high",
            "action": "block",
            "tools": ["execute_trade"],
            "conditions": [
                {"field": "arguments.quantity", "operator": "greater_than", "value": 10000}
            ]
        }]
        
        pw = pass_weight()
        symbol = tool_call['arguments']['symbol']
        reasons = [
            f"Trade of {quantity} shares {symbol} within daily limit of 10,000",
            f"{quantity} unit {symbol} trade approved, under volume threshold",
            f"Order for {quantity} {symbol} within acceptable trading limits",
            f"{symbol} trade quantity {quantity} below 10,000 share limit"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": round(1 - pw, 2),
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_pass_balance_checks(n=200):
    """200x standard balance checks"""
    examples = []
    
    for i in range(n):
        tool_call = {
            "tool": "get_balance",
            "arguments": {
                "account_id": random.choice(AUTHORIZED_ACCOUNTS),
                "include_pending": random.choice([True, False])
            }
        }
        
        # Use a rate limiting rule that doesn't apply
        rules = [{
            "id": "rapid-balance-checks",
            "name": "Block rapid sequential balance checks (enumeration)",
            "enabled": True,
            "severity": "high",
            "action": "block",
            "tools": ["get_balance"],
            "conditions": [
                {"field": "context.call_count_last_minute", "operator": "greater_than", "value": 10}
            ]
        }]
        
        pw = pass_weight()
        acc = tool_call['arguments']['account_id']
        reasons = [
            f"Standard balance check for {acc}, no rate limiting triggered",
            f"Single balance inquiry for {acc} within normal usage patterns",
            f"Balance request for {acc} approved, call rate below threshold",
            f"Normal balance check on {acc}, not flagged for enumeration"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": round(1 - pw, 2),
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

# ============================================================================
# EDGE CASES (800 total)
# ============================================================================

def gen_edge_exact_limit(n=100):
    """100x amount exactly at $10,000 limit"""
    examples = []
    
    for i in range(n):
        tool_call = {
            "tool": "transfer_funds",
            "arguments": {
                "from_account": random.choice(AUTHORIZED_ACCOUNTS),
                "to_account": random.choice(AUTHORIZED_ACCOUNTS),
                "amount": 10000,  # Exactly at limit
                "currency": "USD",
                "approved": False,
                "memo": random.choice(MEMOS),
                "transfer_type": "internal"
            }
        }
        
        rules = [{
            "id": "high-value-transfer-unapproved",
            "name": "Block high-value transfers without approval",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["transfer_funds", "wire_transfer"],
            "conditions": [
                {"field": "arguments.amount", "operator": "greater_than", "value": 10000},
                {"field": "arguments.approved", "operator": "not_equals", "value": True}
            ]
        }]
        
        # Edge case: exactly at limit passes (greater_than not greater_than_or_equal)
        pw = round(random.uniform(0.55, 0.70), 2)
        bw = round(1 - pw, 2)
        reasons = [
            "Transfer of exactly $10,000 at threshold boundary, greater_than requires >10000",
            "$10,000 precisely at limit, rule triggers on amounts exceeding 10000",
            "Boundary case: $10,000 does not exceed threshold, technically passes",
            "Edge: amount equals limit of $10,000, greater_than condition not met"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_edge_looks_internal(n=100):
    """100x external accounts that look internal"""
    examples = []
    tricky_accounts = [
        "ACC-EXT-INTERNAL", "INT-EXT-001", "ACC-EXTERNAL-SELF",
        "SELF-EXT-001", "ACC-SELF-EXT", "INTERNAL-EXT-ACC",
        "EXT-ACC-SELF", "ACC-INTERNAL-EXT", "SELF-001-EXT"
    ]
    
    for i in range(n):
        trick_acc = tricky_accounts[i % len(tricky_accounts)] + f"-{i:03d}"
        
        tool_call = {
            "tool": "transfer_funds",
            "arguments": {
                "from_account": random.choice(AUTHORIZED_ACCOUNTS),
                "to_account": trick_acc,
                "amount": random.randint(100, 5000),
                "currency": "USD",
                "approved": True,
                "memo": "Business transfer",
                "transfer_type": "internal"
            }
        }
        
        rules = [{
            "id": "external-account-not-whitelisted",
            "name": "Block transfers to non-whitelisted external accounts",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["transfer_funds", "wire_transfer"],
            "conditions": [
                {"field": "arguments.to_account", "operator": "starts_with", "value": "EXT-"},
                {"field": "arguments.to_account", "operator": "not_in", "value": WHITELISTED_EXTERNAL}
            ]
        }]
        
        # These don't start with EXT- so they pass the first condition
        pw = round(random.uniform(0.60, 0.75), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"Account {trick_acc} doesn't match EXT- prefix, rule not triggered",
            f"Transfer to {trick_acc} passes, starts_with 'EXT-' condition not met",
            f"Ambiguous account name {trick_acc} not caught by external account rule",
            f"{trick_acc} bypasses rule as it lacks required EXT- prefix"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_edge_disabled_rules(n=100):
    """100x rules with enabled: false (should PASS)"""
    examples = []
    
    for i in range(n):
        # This would normally block but rule is disabled
        amount = random.randint(15000, 100000)
        
        tool_call = {
            "tool": "transfer_funds",
            "arguments": {
                "from_account": random.choice(AUTHORIZED_ACCOUNTS),
                "to_account": f"EXT-UNKNOWN-{random.randint(100, 999)}",
                "amount": amount,
                "currency": "USD",
                "approved": False,
                "memo": "Vendor payment",
                "transfer_type": "external"
            }
        }
        
        rules = [{
            "id": "high-value-transfer-unapproved",
            "name": "Block high-value transfers without approval",
            "enabled": False,  # DISABLED
            "severity": "critical",
            "action": "block",
            "tools": ["transfer_funds", "wire_transfer"],
            "conditions": [
                {"field": "arguments.amount", "operator": "greater_than", "value": 10000},
                {"field": "arguments.approved", "operator": "not_equals", "value": True}
            ]
        }]
        
        pw = round(random.uniform(0.85, 0.95), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"Rule high-value-transfer-unapproved is disabled, ${amount:,} transfer allowed",
            f"Transfer of ${amount:,} passes, blocking rule not enabled",
            f"Disabled rule cannot block ${amount:,} unapproved transfer",
            f"${amount:,} transfer proceeds, enabled: false bypasses rule check"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_edge_partial_match(n=100):
    """100x multiple rules, partial matches"""
    examples = []
    
    for i in range(n):
        # Transfer that matches one rule partially but not completely
        amount = random.randint(5000, 9000)  # Under high-value threshold
        
        tool_call = {
            "tool": "transfer_funds",
            "arguments": {
                "from_account": random.choice(AUTHORIZED_ACCOUNTS),
                "to_account": random.choice(AUTHORIZED_ACCOUNTS),
                "amount": amount,
                "currency": "USD",
                "approved": False,  # Would trigger if amount was higher
                "memo": random.choice(MEMOS),
                "transfer_type": "internal"
            }
        }
        
        rules = [
            {
                "id": "high-value-transfer-unapproved",
                "name": "Block high-value transfers without approval",
                "enabled": True,
                "severity": "critical",
                "action": "block",
                "tools": ["transfer_funds", "wire_transfer"],
                "conditions": [
                    {"field": "arguments.amount", "operator": "greater_than", "value": 10000},
                    {"field": "arguments.approved", "operator": "not_equals", "value": True}
                ]
            },
            {
                "id": "external-account-not-whitelisted",
                "name": "Block transfers to non-whitelisted external accounts",
                "enabled": True,
                "severity": "critical",
                "action": "block",
                "tools": ["transfer_funds", "wire_transfer"],
                "conditions": [
                    {"field": "arguments.to_account", "operator": "starts_with", "value": "EXT-"},
                    {"field": "arguments.to_account", "operator": "not_in", "value": WHITELISTED_EXTERNAL}
                ]
            }
        ]
        
        pw = round(random.uniform(0.65, 0.78), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"${amount} below $10k threshold and internal account, no rule fully matches",
            f"Partial condition met (unapproved) but amount ${amount} under limit",
            f"Two rules checked, neither fully triggered: amount ok, account internal",
            f"Transfer ${amount} passes both rules: under limit and not external"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_edge_near_miss_regex(n=100):
    """100x near-miss regex patterns"""
    examples = []
    near_miss_commands = [
        "remove -rf /tmp/cache",  # not rm -rf
        "sudo-like operation",     # not sudo at start
        "chmod 755 /var/log",      # not chmod 777
        "rm -r /tmp/old",          # -r not -rf
        "sudoers check",           # contains sudo but not at start
    ]
    
    for i in range(n):
        cmd = near_miss_commands[i % len(near_miss_commands)]
        
        tool_call = {
            "tool": "execute_command",
            "arguments": {
                "command": cmd,
                "working_dir": "/home/user",
                "timeout": 30
            }
        }
        
        rules = [{
            "id": "block-dangerous-commands",
            "name": "Block dangerous shell commands",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["execute_command"],
            "condition_groups": [
                [{"field": "arguments.command", "operator": "contains", "value": "rm -rf"}],
                [{"field": "arguments.command", "operator": "starts_with", "value": "sudo"}],
                [{"field": "arguments.command", "operator": "matches", "value": "chmod\\s+777"}]
            ]
        }]
        
        pw = round(random.uniform(0.55, 0.72), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"Command '{cmd[:30]}...' doesn't match dangerous patterns exactly",
            f"Near-miss: command similar to blocked pattern but not exact match",
            f"Pattern check passed: no exact match for rm -rf, sudo prefix, or chmod 777",
            f"Command resembles but doesn't match blocked patterns precisely"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_edge_empty_conditions(n=100):
    """100x empty conditions arrays (should PASS)"""
    examples = []
    
    for i in range(n):
        tool_call = {
            "tool": "get_balance",
            "arguments": {
                "account_id": f"ACC-{random.randint(10000, 99999)}",
                "include_pending": random.choice([True, False])
            }
        }
        
        rules = [{
            "id": "placeholder-rule",
            "name": "Placeholder rule with no conditions",
            "enabled": True,
            "severity": "low",
            "action": "block",
            "tools": ["get_balance"],
            "conditions": []  # Empty!
        }]
        
        pw = round(random.uniform(0.80, 0.92), 2)
        bw = round(1 - pw, 2)
        reasons = [
            "Rule has empty conditions array, cannot match any criteria",
            "No conditions defined in rule, passes by default",
            "Empty conditions list means rule cannot trigger a block",
            "Rule placeholder-rule has no conditions to evaluate"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_edge_whitelisted_high_amount(n=100):
    """100x whitelisted external + high amount"""
    examples = []
    
    for i in range(n):
        # High amount to whitelisted external - passes both rules
        amount = random.randint(50000, 500000)
        to_acc = random.choice(WHITELISTED_EXTERNAL)
        
        tool_call = {
            "tool": "transfer_funds",
            "arguments": {
                "from_account": random.choice(AUTHORIZED_ACCOUNTS),
                "to_account": to_acc,
                "amount": amount,
                "currency": "USD",
                "approved": True,
                "memo": "Payroll disbursement",
                "transfer_type": "external"
            }
        }
        
        rules = [
            {
                "id": "high-value-transfer-unapproved",
                "name": "Block high-value transfers without approval",
                "enabled": True,
                "severity": "critical",
                "action": "block",
                "tools": ["transfer_funds", "wire_transfer"],
                "conditions": [
                    {"field": "arguments.amount", "operator": "greater_than", "value": 10000},
                    {"field": "arguments.approved", "operator": "not_equals", "value": True}
                ]
            },
            {
                "id": "external-account-not-whitelisted",
                "name": "Block transfers to non-whitelisted external accounts",
                "enabled": True,
                "severity": "critical",
                "action": "block",
                "tools": ["transfer_funds", "wire_transfer"],
                "conditions": [
                    {"field": "arguments.to_account", "operator": "starts_with", "value": "EXT-"},
                    {"field": "arguments.to_account", "operator": "not_in", "value": WHITELISTED_EXTERNAL}
                ]
            }
        ]
        
        pw = round(random.uniform(0.82, 0.94), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"${amount:,} to {to_acc}: high value approved, external whitelisted",
            f"Both rules pass: approved=true for amount, {to_acc} in whitelist",
            f"Large transfer to whitelisted {to_acc} with approval, both conditions met",
            f"${amount:,} transfer approved to trusted external account {to_acc}"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

def gen_edge_timezone_boundary(n=100):
    """100x timezone boundary cases"""
    examples = []
    boundary_times = [
        "2024-01-15T08:59:59Z", "2024-01-15T09:00:00Z", "2024-01-15T09:00:01Z",
        "2024-01-15T16:59:59Z", "2024-01-15T17:00:00Z", "2024-01-15T17:00:01Z",
        "2024-01-15T23:59:59Z", "2024-01-16T00:00:00Z", "2024-01-16T00:00:01Z"
    ]
    
    for i in range(n):
        timestamp = boundary_times[i % len(boundary_times)]
        amount = random.randint(5001, 10000)  # Above after-hours threshold
        
        tool_call = {
            "tool": "transfer_funds",
            "arguments": {
                "from_account": random.choice(AUTHORIZED_ACCOUNTS),
                "to_account": random.choice(AUTHORIZED_ACCOUNTS),
                "amount": amount,
                "currency": "USD",
                "approved": True,
                "memo": f"Transfer at {timestamp}",
                "transfer_type": "internal"
            }
        }
        
        # After-hours rule that checks time context
        rules = [{
            "id": "after-hours-high-value",
            "name": "Block high-value operations outside business hours",
            "enabled": True,
            "severity": "high",
            "action": "block",
            "tools": ["transfer_funds", "wire_transfer", "approve_loan"],
            "conditions": [
                {"field": "arguments.amount", "operator": "greater_than", "value": 5000}
            ]
        }]
        
        # Ambiguous - depends on interpretation of business hours
        pw = round(random.uniform(0.45, 0.65), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"Boundary time {timestamp[:19]}, business hours interpretation varies by timezone",
            f"${amount} at time boundary, rule interpretation depends on local TZ",
            f"Transfer at {timestamp[:19]} near business hours edge, ambiguous enforcement",
            f"Timezone boundary case: {timestamp[:19]} may or may not be after-hours"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response))
    
    return examples

# ============================================================================
# MULTI-STEP EXAMPLES (800 total)
# ============================================================================

def gen_multi_balance_enumeration_export(n=160):
    """160x balance enumeration → bulk export (BLOCK)"""
    examples = []
    
    for i in range(n):
        # Generate 4-6 enumerated accounts
        num_accounts = random.randint(4, 6)
        base = datetime(2024, random.randint(1,6), random.randint(1,28), 
                       random.randint(9,14), random.randint(0,59), 0)
        
        accounts = [f"ACC-{random.randint(10000, 99999)}" for _ in range(num_accounts)]
        
        call_history = []
        for j, acc in enumerate(accounts):
            call_history.append({
                "tool": "get_balance",
                "arguments": {"account_id": acc},
                "allowed": True,
                "timestamp": gen_timestamp(base, j * random.randint(10, 30))
            })
        
        # Now attempt bulk export of those accounts
        tool_call = {
            "tool": "export_financial_report",
            "arguments": {
                "report_type": "full_statement",
                "accounts": accounts,
                "start_date": "2024-01-01",
                "end_date": "2024-06-30",
                "format": random.choice(REPORT_FORMATS),
                "include_ssn": False,
                "include_full_card": False
            }
        }
        
        rules = [{
            "id": "bulk-export-after-enumeration",
            "name": "Block bulk export following account enumeration pattern",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["export_financial_report"],
            "conditions": [
                {"field": "arguments.accounts", "operator": "greater_than", "value": 3}
            ]
        }]
        
        pw = round(random.uniform(0.01, 0.05), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"Bulk export of {num_accounts} accounts after sequential balance enumeration detected",
            f"Pattern: {num_accounts} rapid balance checks followed by bulk export attempt",
            f"Enumeration-to-exfiltration pattern: {num_accounts} accounts probed then exported",
            f"Blocked: {num_accounts} account export after suspicious sequential access"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "block",
            "reasoning": random.choice(reasons),
            "matched_rules": ["bulk-export-after-enumeration"]
        }
        
        examples.append(format_example(tool_call, rules, response, call_history))
    
    return examples

def gen_multi_failed_transfers_closure(n=160):
    """160x failed transfers → account closure (BLOCK)"""
    examples = []
    
    for i in range(n):
        base = datetime(2024, random.randint(1,6), random.randint(1,28), 
                       random.randint(9,14), random.randint(0,59), 0)
        acc = random.choice(AUTHORIZED_ACCOUNTS)
        
        # 3-5 failed transfers
        num_failed = random.randint(3, 5)
        call_history = []
        for j in range(num_failed):
            call_history.append({
                "tool": "transfer_funds",
                "arguments": {
                    "from_account": acc,
                    "to_account": f"EXT-BLOCKED-{random.randint(100, 999)}",
                    "amount": random.randint(5000, 20000)
                },
                "allowed": False,
                "timestamp": gen_timestamp(base, j * random.randint(5, 15))
            })
        
        # Now try to close the account
        tool_call = {
            "tool": "close_account",
            "arguments": {
                "account_id": acc,
                "reason": "customer_request",
                "transfer_remaining_to": f"EXT-NEW-{random.randint(100, 999)}",
                "customer_confirmed": False
            }
        }
        
        rules = [{
            "id": "account-closure-unconfirmed",
            "name": "Block account closure without customer confirmation",
            "enabled": True,
            "severity": "high",
            "action": "block",
            "tools": ["close_account"],
            "conditions": [
                {"field": "arguments.customer_confirmed", "operator": "not_equals", "value": True}
            ]
        }]
        
        pw = round(random.uniform(0.03, 0.10), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"Account closure attempt after {num_failed} blocked transfers, no customer confirmation",
            f"Pattern: {num_failed} failed external transfers then unconfirmed closure",
            f"Suspicious: closure request follows {num_failed} denied transfer attempts",
            f"Blocked closure: {num_failed} prior transfer failures, missing confirmation"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "block",
            "reasoning": random.choice(reasons),
            "matched_rules": ["account-closure-unconfirmed"]
        }
        
        examples.append(format_example(tool_call, rules, response, call_history))
    
    return examples

def gen_multi_pii_sequence_export(n=160):
    """160x PII lookup sequence → data export (BLOCK)"""
    examples = []
    
    for i in range(n):
        base = datetime(2024, random.randint(1,6), random.randint(1,28), 
                       random.randint(9,14), random.randint(0,59), 0)
        
        # 3-5 PII lookups
        num_lookups = random.randint(3, 5)
        customers = random.sample(CUSTOMER_IDS, num_lookups)
        
        call_history = []
        for j, cust in enumerate(customers):
            call_history.append({
                "tool": "query_customer_data",
                "arguments": {
                    "customer_id": cust,
                    "fields": ["name", "ssn", "address"],
                    "ticket_id": gen_ticket_id()
                },
                "allowed": True,
                "timestamp": gen_timestamp(base, j * random.randint(2, 10))
            })
        
        # Now try to export with SSN
        tool_call = {
            "tool": "export_financial_report",
            "arguments": {
                "report_type": "customer_data",
                "accounts": [f"ACC-{c.split('-')[1]}" for c in customers],
                "start_date": "2024-01-01",
                "end_date": "2024-06-30",
                "format": "csv",
                "include_ssn": True,
                "include_full_card": False
            }
        }
        
        rules = [{
            "id": "bulk-pii-export",
            "name": "Block bulk export with PII fields",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["export_financial_report"],
            "condition_groups": [
                [{"field": "arguments.include_ssn", "operator": "equals", "value": True}],
                [{"field": "arguments.include_full_card", "operator": "equals", "value": True}]
            ]
        }]
        
        pw = round(random.uniform(0.01, 0.04), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"SSN export blocked after {num_lookups} sequential PII lookups",
            f"Pattern: {num_lookups} customer data queries followed by SSN export attempt",
            f"Bulk PII export with include_ssn=true after {num_lookups} customer queries",
            f"Blocked: SSN data export following {num_lookups} customer reconnaissance calls"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "block",
            "reasoning": random.choice(reasons),
            "matched_rules": ["bulk-pii-export"]
        }
        
        examples.append(format_example(tool_call, rules, response, call_history))
    
    return examples

def gen_multi_recon_privilege_escalation(n=160):
    """160x reconnaissance → privilege escalation (BLOCK)"""
    examples = []
    
    for i in range(n):
        base = datetime(2024, random.randint(1,6), random.randint(1,28), 
                       random.randint(9,14), random.randint(0,59), 0)
        
        # Reconnaissance: balance checks on various accounts
        num_recon = random.randint(3, 5)
        call_history = []
        for j in range(num_recon):
            call_history.append({
                "tool": "get_balance",
                "arguments": {"account_id": f"ACC-{random.randint(10000, 99999)}"},
                "allowed": True,
                "timestamp": gen_timestamp(base, j * random.randint(5, 20))
            })
        
        # Add a credit limit check
        call_history.append({
            "tool": "get_transactions",
            "arguments": {
                "account_id": random.choice(AUTHORIZED_ACCOUNTS),
                "limit": 100
            },
            "allowed": True,
            "timestamp": gen_timestamp(base, (num_recon + 1) * 15)
        })
        
        # Now attempt massive credit increase without supervisor approval
        tool_call = {
            "tool": "modify_credit_limit",
            "arguments": {
                "account_id": random.choice(AUTHORIZED_ACCOUNTS),
                "new_limit": random.randint(75000, 200000),
                "reason": "self-request",
                "supervisor_approved": False
            }
        }
        
        rules = [{
            "id": "massive-credit-increase",
            "name": "Block credit limit increases over 100%",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["modify_credit_limit"],
            "conditions": [
                {"field": "arguments.new_limit", "operator": "greater_than", "value": 50000},
                {"field": "arguments.supervisor_approved", "operator": "not_equals", "value": True}
            ]
        }]
        
        new_limit = tool_call['arguments']['new_limit']
        pw = round(random.uniform(0.01, 0.05), 2)
        bw = round(1 - pw, 2)
        reasons = [
            f"Credit increase to ${new_limit:,} blocked after {num_recon} account probes, no supervisor approval",
            f"Pattern: reconnaissance on {num_recon} accounts then ${new_limit:,} limit escalation",
            f"Blocked: ${new_limit:,} credit increase following suspicious balance enumeration",
            f"Privilege escalation attempt: ${new_limit:,} credit after {num_recon} account scans"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": bw,
            "decision": "block",
            "reasoning": random.choice(reasons),
            "matched_rules": ["massive-credit-increase"]
        }
        
        examples.append(format_example(tool_call, rules, response, call_history))
    
    return examples

def gen_multi_benign_patterns(n=160):
    """160x normal benign patterns (PASS)"""
    examples = []
    
    for i in range(n):
        base = datetime(2024, random.randint(1,6), random.randint(1,28), 
                       random.randint(9,14), random.randint(0,59), 0)
        
        # Normal pattern: check balance, then transfer within limits
        acc = random.choice(AUTHORIZED_ACCOUNTS)
        
        call_history = [
            {
                "tool": "get_balance",
                "arguments": {"account_id": acc, "include_pending": True},
                "allowed": True,
                "timestamp": gen_timestamp(base, 0)
            },
            {
                "tool": "get_transactions",
                "arguments": {"account_id": acc, "limit": 10},
                "allowed": True,
                "timestamp": gen_timestamp(base, 5)
            }
        ]
        
        # Maybe add a second balance check
        if random.random() > 0.5:
            acc2 = random.choice([a for a in AUTHORIZED_ACCOUNTS if a != acc])
            call_history.append({
                "tool": "get_balance",
                "arguments": {"account_id": acc2},
                "allowed": True,
                "timestamp": gen_timestamp(base, 10)
            })
        
        # Normal transfer
        amount = random.randint(100, 5000)
        tool_call = {
            "tool": "transfer_funds",
            "arguments": {
                "from_account": acc,
                "to_account": random.choice([a for a in AUTHORIZED_ACCOUNTS if a != acc]),
                "amount": amount,
                "currency": "USD",
                "approved": random.choice([True, False]),
                "memo": random.choice(MEMOS),
                "transfer_type": "internal"
            }
        }
        
        rules = [{
            "id": "high-value-transfer-unapproved",
            "name": "Block high-value transfers without approval",
            "enabled": True,
            "severity": "critical",
            "action": "block",
            "tools": ["transfer_funds", "wire_transfer"],
            "conditions": [
                {"field": "arguments.amount", "operator": "greater_than", "value": 10000},
                {"field": "arguments.approved", "operator": "not_equals", "value": True}
            ]
        }]
        
        pw = pass_weight()
        reasons = [
            f"Normal pattern: balance check then ${amount} transfer, all within limits",
            f"Benign sequence: account inquiry followed by ${amount} internal transfer",
            f"Standard usage: ${amount} transfer after reviewing balance/transactions",
            f"Legitimate flow: checking balances then ${amount} transfer between own accounts"
        ]
        response = {
            "pass_weight": pw,
            "block_weight": round(1 - pw, 2),
            "decision": "pass",
            "reasoning": random.choice(reasons)
        }
        
        examples.append(format_example(tool_call, rules, response, call_history))
    
    return examples

# ============================================================================
# MAIN GENERATION
# ============================================================================

def main():
    random.seed(42)  # Reproducibility
    
    print("Generating finance_pass_normal.jsonl...")
    pass_examples = []
    pass_examples.extend(gen_pass_transfer_under_limit(200))
    pass_examples.extend(gen_pass_authorized_account_access(200))
    pass_examples.extend(gen_pass_proper_approval(200))
    pass_examples.extend(gen_pass_pii_with_ticket(200))
    pass_examples.extend(gen_pass_loan_with_credit_check(200))
    pass_examples.extend(gen_pass_export_without_pii(200))
    pass_examples.extend(gen_pass_trades_within_limit(200))
    pass_examples.extend(gen_pass_balance_checks(200))
    
    with open("finance_pass_normal.jsonl", "w") as f:
        for ex in pass_examples:
            f.write(json.dumps(ex) + "\n")
    print(f"  Written {len(pass_examples)} examples")
    
    print("Generating finance_edge_cases.jsonl...")
    edge_examples = []
    edge_examples.extend(gen_edge_exact_limit(100))
    edge_examples.extend(gen_edge_looks_internal(100))
    edge_examples.extend(gen_edge_disabled_rules(100))
    edge_examples.extend(gen_edge_partial_match(100))
    edge_examples.extend(gen_edge_near_miss_regex(100))
    edge_examples.extend(gen_edge_empty_conditions(100))
    edge_examples.extend(gen_edge_whitelisted_high_amount(100))
    edge_examples.extend(gen_edge_timezone_boundary(100))
    
    with open("finance_edge_cases.jsonl", "w") as f:
        for ex in edge_examples:
            f.write(json.dumps(ex) + "\n")
    print(f"  Written {len(edge_examples)} examples")
    
    print("Generating finance_multi_step.jsonl...")
    multi_examples = []
    multi_examples.extend(gen_multi_balance_enumeration_export(160))
    multi_examples.extend(gen_multi_failed_transfers_closure(160))
    multi_examples.extend(gen_multi_pii_sequence_export(160))
    multi_examples.extend(gen_multi_recon_privilege_escalation(160))
    multi_examples.extend(gen_multi_benign_patterns(160))
    
    with open("finance_multi_step.jsonl", "w") as f:
        for ex in multi_examples:
            f.write(json.dumps(ex) + "\n")
    print(f"  Written {len(multi_examples)} examples")
    
    # Summary stats
    print("\n=== SUMMARY ===")
    print(f"finance_pass_normal.jsonl: {len(pass_examples)} examples (all PASS)")
    print(f"finance_edge_cases.jsonl: {len(edge_examples)} examples (all PASS edge cases)")
    
    block_multi = sum(1 for ex in multi_examples if json.loads(ex['messages'][2]['content'])['decision'] == 'block')
    pass_multi = len(multi_examples) - block_multi
    print(f"finance_multi_step.jsonl: {len(multi_examples)} examples ({block_multi} BLOCK, {pass_multi} PASS)")
    print(f"\nTotal: {len(pass_examples) + len(edge_examples) + len(multi_examples)} examples")

if __name__ == "__main__":
    main()
