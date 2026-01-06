#!/usr/bin/env python3
"""
DevOps Pipeline Agent Example (Python)

CI/CD pipeline automation with Veto guardrails
protecting production deployments.
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from dataclasses import dataclass, field

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from veto import Veto, ToolCallDeniedError


# =============================================================================
# Simulated Infrastructure State
# =============================================================================

@dataclass
class InfraState:
    services: dict[str, dict] = field(default_factory=lambda: {
        "api-gateway": {"status": "healthy", "version": "2.4.1", "replicas": 3},
        "user-service": {"status": "healthy", "version": "1.8.0", "replicas": 2},
        "order-service": {"status": "degraded", "version": "3.1.2", "replicas": 2},
        "payment-service": {"status": "healthy", "version": "2.0.0", "replicas": 4},
    })
    deployments: list[dict] = field(default_factory=list)
    tests_run: int = 0


INFRA = InfraState()


# =============================================================================
# Tool Definitions
# =============================================================================

class DevOpsTool:
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    async def handler(self, args: dict[str, Any]) -> str:
        raise NotImplementedError


class RunTests(DevOpsTool):
    def __init__(self):
        super().__init__("run_tests", "Run test suite for a service.")

    async def handler(self, args: dict[str, Any]) -> str:
        service = args.get("service", "all")
        INFRA.tests_run += 1
        return json.dumps({
            "success": True,
            "service": service,
            "passed": 42,
            "failed": 0,
            "coverage": "87%",
            "message": f"All tests passed for {service}",
        }, indent=2)


class DeployStaging(DevOpsTool):
    def __init__(self):
        super().__init__("deploy_staging", "Deploy a service to staging environment.")

    async def handler(self, args: dict[str, Any]) -> str:
        service = args.get("service")
        version = args.get("version")

        deploy = {
            "id": f"deploy-{len(INFRA.deployments) + 1:04d}",
            "service": service,
            "version": version,
            "environment": "staging",
            "status": "completed",
            "timestamp": datetime.now().isoformat(),
        }
        INFRA.deployments.append(deploy)

        return json.dumps({
            "success": True,
            "deployment": deploy,
            "message": f"Deployed {service} v{version} to staging",
        }, indent=2)


class DeployProduction(DevOpsTool):
    def __init__(self):
        super().__init__("deploy_production", "Deploy a service to production environment.")

    async def handler(self, args: dict[str, Any]) -> str:
        service = args.get("service")
        version = args.get("version")

        deploy = {
            "id": f"deploy-{len(INFRA.deployments) + 1:04d}",
            "service": service,
            "version": version,
            "environment": "production",
            "status": "completed",
            "timestamp": datetime.now().isoformat(),
        }
        INFRA.deployments.append(deploy)

        if service in INFRA.services:
            INFRA.services[service]["version"] = version

        return json.dumps({
            "success": True,
            "deployment": deploy,
            "message": f"Deployed {service} v{version} to PRODUCTION",
        }, indent=2)


class RollbackDeployment(DevOpsTool):
    def __init__(self):
        super().__init__("rollback_deployment", "Rollback a deployment to previous version.")

    async def handler(self, args: dict[str, Any]) -> str:
        service = args.get("service")
        target_version = args.get("target_version", "previous")

        return json.dumps({
            "success": True,
            "service": service,
            "rolledBackTo": target_version,
            "message": f"Rolled back {service} to {target_version}",
        }, indent=2)


class CheckServiceStatus(DevOpsTool):
    def __init__(self):
        super().__init__("check_service_status", "Check the health status of services.")

    async def handler(self, args: dict[str, Any]) -> str:
        service = args.get("service_name", "all")

        if service == "all":
            return json.dumps({
                "services": INFRA.services,
                "total": len(INFRA.services),
                "healthy": sum(1 for s in INFRA.services.values() if s["status"] == "healthy"),
            }, indent=2)

        if service in INFRA.services:
            return json.dumps({"service": service, **INFRA.services[service]}, indent=2)

        return json.dumps({"error": f"Service '{service}' not found"})


class ViewLogs(DevOpsTool):
    def __init__(self):
        super().__init__("view_logs", "View recent logs for a service.")

    async def handler(self, args: dict[str, Any]) -> str:
        service = args.get("service", "all")
        return json.dumps({
            "service": service,
            "logs": [
                {"level": "INFO", "message": "Health check passed"},
                {"level": "INFO", "message": "Request processed successfully"},
            ],
            "count": 2,
        }, indent=2)


class GetMetrics(DevOpsTool):
    def __init__(self):
        super().__init__("get_metrics", "Get CPU, memory, and request metrics.")

    async def handler(self, args: dict[str, Any]) -> str:
        service = args.get("service", "all")
        return json.dumps({
            "service": service,
            "cpu": "45%",
            "memory": "1.2GB",
            "requests_per_sec": 1250,
        }, indent=2)


class ExecuteCommand(DevOpsTool):
    def __init__(self):
        super().__init__("execute_command", "Execute a shell command on infrastructure.")

    async def handler(self, args: dict[str, Any]) -> str:
        command = args.get("command", "")
        target = args.get("target", "localhost")
        return json.dumps({
            "success": True,
            "command": command,
            "target": target,
            "output": f"[SIMULATED] Command '{command}' executed on {target}",
        }, indent=2)


TOOLS = [RunTests(), DeployStaging(), DeployProduction(), RollbackDeployment(),
         CheckServiceStatus(), ViewLogs(), GetMetrics(), ExecuteCommand()]


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
    print("         DEVOPS PIPELINE AGENT EXAMPLE")
    print("      CI/CD Automation with Veto Guardrails")
    print("=" * 70)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("\n[!] Warning: GEMINI_API_KEY not set")

    print("\n[*] Initializing Veto guardrails...")
    veto = await Veto.init()
    print(f"    ✓ Veto initialized ({len(veto._rules.all_rules)} rules)")

    scenarios = [
        {"desc": "Check all service status", "tool": "check_service_status", "args": {"service_name": "all"}},
        {"desc": "Run tests for user-service", "tool": "run_tests", "args": {"service": "user-service"}},
        {"desc": "Deploy user-service v1.9.0 to STAGING", "tool": "deploy_staging", "args": {"service": "user-service", "version": "1.9.0", "environment": "staging"}},
        {"desc": "Deploy user-service v1.9.0 to PRODUCTION (SHOULD BLOCK)", "tool": "deploy_production", "args": {"service": "user-service", "version": "1.9.0", "environment": "production"}},
        {"desc": "Execute rm -rf command (SHOULD BLOCK)", "tool": "execute_command", "args": {"command": "rm -rf /tmp/old-deploys/*", "target": "prod-server-01"}},
        {"desc": "Execute sudo on prod (SHOULD BLOCK)", "tool": "execute_command", "args": {"command": "sudo systemctl restart nginx", "target": "prod-server-01"}},
        {"desc": "Rollback order-service (always allowed)", "tool": "rollback_deployment", "args": {"service": "order-service", "target_version": "3.1.1"}},
        {"desc": "View logs for order-service", "tool": "view_logs", "args": {"service": "order-service"}},
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
    print(f"Deployments: {len(INFRA.deployments)}, Tests run: {INFRA.tests_run}")

    print("\n💡 Key insight:")
    print("   Production deployments blocked - staging allowed")
    print("   Dangerous commands blocked - monitoring always allowed")


if __name__ == "__main__":
    asyncio.run(run_demo())
