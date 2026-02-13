import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from veto.cloud.policy_cache import PolicyCache


def make_mock_client(response=None):
    client = MagicMock()
    client.fetch_policy = AsyncMock(return_value=response)
    client.log_decision = MagicMock()
    return client


DETERMINISTIC_POLICY = {
    "toolName": "send_email",
    "mode": "deterministic",
    "constraints": [{"argumentName": "to", "enabled": True, "regex": "^[^@]+@[^@]+$"}],
    "version": 1,
}

LLM_POLICY = {
    "toolName": "execute_trade",
    "mode": "llm",
    "constraints": [],
    "version": 1,
}

POLICY_WITH_RATE_LIMITS = {
    **DETERMINISTIC_POLICY,
    "rateLimits": {"callLimits": [{"maxCalls": 10, "windowSeconds": 60}]},
}


class TestPolicyCache:
    def test_return_none_on_cache_miss(self):
        client = make_mock_client(DETERMINISTIC_POLICY)
        cache = PolicyCache(client)
        assert cache.get("send_email") is None

    @pytest.mark.asyncio
    async def test_return_cached_policy_after_background_fetch(self):
        client = make_mock_client(DETERMINISTIC_POLICY)
        cache = PolicyCache(client)

        cache.get("send_email")  # triggers background fetch
        await asyncio.sleep(0.1)

        result = cache.get("send_email")
        assert result is not None
        assert result.tool_name == "send_email"
        assert result.mode == "deterministic"
        assert len(result.constraints) == 1

    @pytest.mark.asyncio
    async def test_cache_llm_policies(self):
        client = make_mock_client(LLM_POLICY)
        cache = PolicyCache(client)

        cache.get("execute_trade")
        await asyncio.sleep(0.1)

        result = cache.get("execute_trade")
        assert result is not None
        assert result.mode == "llm"

    @pytest.mark.asyncio
    async def test_detect_rate_limits(self):
        client = make_mock_client(POLICY_WITH_RATE_LIMITS)
        cache = PolicyCache(client)

        cache.get("send_email")
        await asyncio.sleep(0.1)

        result = cache.get("send_email")
        assert result is not None
        assert result.has_rate_limits is True

    @pytest.mark.asyncio
    async def test_detect_session_constraints(self):
        policy = {**DETERMINISTIC_POLICY, "sessionConstraints": {"maxCalls": 5}}
        client = make_mock_client(policy)
        cache = PolicyCache(client)

        cache.get("send_email")
        await asyncio.sleep(0.1)

        result = cache.get("send_email")
        assert result is not None
        assert result.has_session_constraints is True

    @pytest.mark.asyncio
    async def test_return_stale_and_trigger_refresh(self):
        client = make_mock_client(DETERMINISTIC_POLICY)
        cache = PolicyCache(client, fresh_seconds=0.05, max_seconds=0.5)

        cache.get("send_email")
        await asyncio.sleep(0.1)
        assert cache.get("send_email") is not None

        # Wait past fresh time
        await asyncio.sleep(0.1)
        client.fetch_policy.reset_mock()

        result = cache.get("send_email")
        assert result is not None  # returns stale value
        await asyncio.sleep(0.1)
        client.fetch_policy.assert_called_once()

    @pytest.mark.asyncio
    async def test_return_none_when_fully_expired(self):
        client = make_mock_client(DETERMINISTIC_POLICY)
        cache = PolicyCache(client, fresh_seconds=0.05, max_seconds=0.1)

        cache.get("send_email")
        await asyncio.sleep(0.05)
        assert cache.get("send_email") is not None

        await asyncio.sleep(0.2)
        result = cache.get("send_email")
        assert result is None

    @pytest.mark.asyncio
    async def test_handle_fetch_failure(self):
        client = make_mock_client(None)
        cache = PolicyCache(client)

        cache.get("nonexistent")
        await asyncio.sleep(0.1)

        assert cache.get("nonexistent") is None

    @pytest.mark.asyncio
    async def test_invalidate_specific_tool(self):
        client = make_mock_client(DETERMINISTIC_POLICY)
        cache = PolicyCache(client)

        cache.get("send_email")
        await asyncio.sleep(0.1)
        assert cache.get("send_email") is not None

        cache.invalidate("send_email")
        assert cache.get("send_email") is None

    @pytest.mark.asyncio
    async def test_invalidate_all(self):
        client = make_mock_client(DETERMINISTIC_POLICY)
        cache = PolicyCache(client)

        cache.get("send_email")
        await asyncio.sleep(0.1)
        assert cache.get("send_email") is not None

        cache.invalidate_all()
        assert cache.get("send_email") is None

    @pytest.mark.asyncio
    async def test_no_duplicate_concurrent_refreshes(self):
        client = make_mock_client(DETERMINISTIC_POLICY)
        cache = PolicyCache(client)

        cache.get("send_email")
        cache.get("send_email")
        cache.get("send_email")

        await asyncio.sleep(0.1)
        assert client.fetch_policy.call_count == 1
