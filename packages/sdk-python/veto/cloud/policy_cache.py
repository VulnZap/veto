import asyncio
import time
from typing import Any, Optional, TYPE_CHECKING

from veto.deterministic.types import ArgumentConstraint, DeterministicPolicy

if TYPE_CHECKING:
    from veto.cloud.client import VetoCloudClient


class PolicyCache:
    def __init__(
        self,
        client: "VetoCloudClient",
        fresh_seconds: float = 60.0,
        max_seconds: float = 300.0,
    ):
        self._client = client
        self._fresh_seconds = fresh_seconds
        self._max_seconds = max_seconds
        self._cache: dict[str, _CacheEntry] = {}
        self._refreshing: set[str] = set()

    def get(self, tool_name: str) -> Optional[DeterministicPolicy]:
        entry = self._cache.get(tool_name)
        now = time.monotonic()

        if entry is None:
            self._background_refresh(tool_name)
            return None

        if now < entry.stale_at:
            return entry.policy

        if now < entry.expired_at:
            self._background_refresh(tool_name)
            return entry.policy

        self._background_refresh(tool_name)
        return None

    def invalidate(self, tool_name: str) -> None:
        self._cache.pop(tool_name, None)

    def invalidate_all(self) -> None:
        self._cache.clear()

    def _background_refresh(self, tool_name: str) -> None:
        if tool_name in self._refreshing:
            return

        self._refreshing.add(tool_name)

        try:
            loop = asyncio.get_running_loop()
            loop.call_soon(lambda: asyncio.ensure_future(self._do_refresh(tool_name)))
        except RuntimeError:
            self._refreshing.discard(tool_name)

    async def _do_refresh(self, tool_name: str) -> None:
        try:
            response = await self._client.fetch_policy(tool_name)
            if response is None:
                return

            now = time.monotonic()
            policy = DeterministicPolicy(
                tool_name=response.get("toolName", tool_name),
                mode=response.get("mode", "deterministic"),
                constraints=[
                    _parse_constraint(c) for c in response.get("constraints", [])
                ],
                has_session_constraints=response.get("sessionConstraints") is not None,
                has_rate_limits=response.get("rateLimits") is not None,
                version=response.get("version", 0),
                fetched_at=now,
            )

            self._cache[tool_name] = _CacheEntry(
                policy=policy,
                stale_at=now + self._fresh_seconds,
                expired_at=now + self._max_seconds,
            )
        except Exception:
            pass
        finally:
            self._refreshing.discard(tool_name)


class _CacheEntry:
    __slots__ = ("policy", "stale_at", "expired_at")

    def __init__(self, policy: DeterministicPolicy, stale_at: float, expired_at: float):
        self.policy = policy
        self.stale_at = stale_at
        self.expired_at = expired_at


def _parse_constraint(data: dict[str, Any]) -> ArgumentConstraint:
    return ArgumentConstraint(
        argument_name=data.get("argumentName", ""),
        enabled=data.get("enabled", True),
        greater_than=data.get("greaterThan"),
        less_than=data.get("lessThan"),
        greater_than_or_equal=data.get("greaterThanOrEqual"),
        less_than_or_equal=data.get("lessThanOrEqual"),
        minimum=data.get("minimum"),
        maximum=data.get("maximum"),
        min_length=data.get("minLength"),
        max_length=data.get("maxLength"),
        regex=data.get("regex"),
        enum=data.get("enum"),
        min_items=data.get("minItems"),
        max_items=data.get("maxItems"),
        required=data.get("required"),
        not_null=data.get("notNull"),
    )
