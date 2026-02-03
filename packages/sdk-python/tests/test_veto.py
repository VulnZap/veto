"""
Tests for Veto core class.
"""

import os
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from veto import Veto, VetoOptions
from veto.cloud.client import VetoCloudClient, VetoCloudConfig
from veto.cloud.types import ValidationResponse, ToolRegistrationResponse


@pytest.fixture
def mock_cloud_client():
    """Create a mock cloud client for testing."""
    client = MagicMock(spec=VetoCloudClient)
    client._base_url = "https://api.veto.dev"
    client._api_key = "test-key"

    # Mock register_tools to return success
    client.register_tools = AsyncMock(
        return_value=ToolRegistrationResponse(
            success=True,
            registered_tools=["test_tool"],
        )
    )

    # Mock validate to allow by default
    client.validate = AsyncMock(
        return_value=ValidationResponse(
            decision="allow",
            reason="Allowed by mock",
        )
    )

    return client


class TestVetoInit:
    """Tests for Veto.init() method."""

    async def test_init_without_api_key(self):
        """Should initialize even without API key (with warning)."""
        # Clear any existing API key
        old_key = os.environ.pop("VETO_API_KEY", None)

        try:
            veto = await Veto.init(VetoOptions(log_level="silent"))
            assert veto is not None
            assert isinstance(veto, Veto)
        finally:
            if old_key:
                os.environ["VETO_API_KEY"] = old_key

    async def test_init_with_api_key(self):
        """Should initialize with API key from options."""
        veto = await Veto.init(VetoOptions(
            api_key="test-api-key",
            log_level="silent",
        ))
        assert veto is not None
        assert veto._cloud_client._api_key == "test-api-key"

    async def test_init_with_custom_base_url(self):
        """Should use custom base URL when provided."""
        veto = await Veto.init(VetoOptions(
            api_key="test-key",
            base_url="https://custom.veto.dev",
            log_level="silent",
        ))
        assert veto._cloud_client._base_url == "https://custom.veto.dev"

    async def test_init_from_env_var(self):
        """Should use API key from environment variable."""
        os.environ["VETO_API_KEY"] = "env-test-key"

        try:
            veto = await Veto.init(VetoOptions(log_level="silent"))
            assert veto._cloud_client._api_key == "env-test-key"
        finally:
            del os.environ["VETO_API_KEY"]


class TestVetoWrap:
    """Tests for Veto.wrap() method."""

    async def test_wrap_preserves_tool_attributes(self, mock_cloud_client):
        """Should wrap tools and preserve their attributes."""

        class MockTool:
            name = "test_tool"
            description = "Test tool"

            async def handler(self, args):
                return "result"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        veto._cloud_client = mock_cloud_client

        wrapped = veto.wrap([tool])

        assert len(wrapped) == 1
        assert wrapped[0].name == "test_tool"

    async def test_wrap_executes_handler_when_allowed(self, mock_cloud_client):
        """Should execute handler when validation passes."""
        call_count = 0

        class MockTool:
            name = "allowed_tool"
            description = "Tool that should be allowed"

            async def handler(self, args):
                nonlocal call_count
                call_count += 1
                return "success"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        veto._cloud_client = mock_cloud_client

        wrapped = veto.wrap([tool])
        result = await wrapped[0].handler({})

        assert result == "success"
        assert call_count == 1

    async def test_wrap_blocks_when_denied(self, mock_cloud_client):
        """Should block execution when validation fails."""
        # Configure mock to deny
        mock_cloud_client.validate = AsyncMock(
            return_value=ValidationResponse(
                decision="deny",
                reason="Blocked by test",
            )
        )

        class MockTool:
            name = "blocked_tool"
            description = "Tool that should be blocked"

            async def handler(self, args):
                return "should not reach here"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        veto._cloud_client = mock_cloud_client

        wrapped = veto.wrap([tool])

        from veto.core.interceptor import ToolCallDeniedError
        with pytest.raises(ToolCallDeniedError):
            await wrapped[0].handler({})

    async def test_wrap_extracts_tool_signature(self, mock_cloud_client):
        """Should extract and register tool signatures with cloud."""

        class MockTool:
            name = "signature_tool"
            description = "Tool with parameters"

            async def handler(self, query: str, limit: int = 10):
                return f"Results for {query} (limit {limit})"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        # Replace cloud client BEFORE wrapping so registration uses mock
        veto._cloud_client = mock_cloud_client

        # Need to await the registration which happens in wrap
        import asyncio
        wrapped = veto.wrap([tool])
        # Give async task time to complete
        await asyncio.sleep(0.1)

        # Verify register_tools was called
        mock_cloud_client.register_tools.assert_called_once()


class TestVetoHistory:
    """Tests for Veto history tracking."""

    async def test_tracks_allowed_calls(self, mock_cloud_client):
        """Should track allowed tool calls."""

        class MockTool:
            name = "tracked_tool"
            description = "Tracked tool"

            async def handler(self, args):
                return "ok"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        veto._cloud_client = mock_cloud_client

        wrapped = veto.wrap([tool])
        await wrapped[0].handler({})

        stats = veto.get_history_stats()
        assert stats.total_calls == 1
        assert stats.allowed_calls == 1
        assert stats.denied_calls == 0

    async def test_tracks_denied_calls(self, mock_cloud_client):
        """Should track denied tool calls."""
        mock_cloud_client.validate = AsyncMock(
            return_value=ValidationResponse(
                decision="deny",
                reason="Blocked",
            )
        )

        class MockTool:
            name = "denied_tool"
            description = "Tool that gets denied"

            async def handler(self, args):
                return "ok"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        veto._cloud_client = mock_cloud_client

        wrapped = veto.wrap([tool])

        from veto.core.interceptor import ToolCallDeniedError
        try:
            await wrapped[0].handler({})
        except ToolCallDeniedError:
            pass

        stats = veto.get_history_stats()
        assert stats.total_calls == 1
        assert stats.denied_calls == 1

    async def test_clear_history(self, mock_cloud_client):
        """Should clear history."""

        class MockTool:
            name = "clear_test_tool"
            description = "Tool for clear test"

            async def handler(self, args):
                return "ok"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        veto._cloud_client = mock_cloud_client

        wrapped = veto.wrap([tool])
        await wrapped[0].handler({})
        assert veto.get_history_stats().total_calls == 1

        veto.clear_history()
        assert veto.get_history_stats().total_calls == 0

    async def test_get_history_entries(self, mock_cloud_client):
        """Should return history entries."""

        class MockTool:
            name = "history_tool"
            description = "Tool for history test"

            async def handler(self, args):
                return "ok"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        veto._cloud_client = mock_cloud_client

        wrapped = veto.wrap([tool])
        await wrapped[0].handler({"key": "value"})

        stats = veto.get_history_stats()
        assert stats.total_calls == 1
        assert "history_tool" in stats.calls_by_tool


class TestVetoModes:
    """Tests for Veto operating modes."""

    async def test_strict_mode_is_default(self):
        """Strict mode should be default."""
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        assert veto._mode == "strict"

    async def test_log_mode_from_options(self):
        """Should respect log mode from options."""
        veto = await Veto.init(VetoOptions(
            api_key="test",
            mode="log",
            log_level="silent",
        ))
        assert veto._mode == "log"

    async def test_log_mode_allows_but_logs(self, mock_cloud_client):
        """Log mode should allow denied calls but log them."""
        mock_cloud_client.validate = AsyncMock(
            return_value=ValidationResponse(
                decision="deny",
                reason="Would be blocked",
            )
        )

        class MockTool:
            name = "log_mode_tool"
            description = "Tool for log mode test"

            async def handler(self, args):
                return "executed"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(
            api_key="test",
            mode="log",
            log_level="silent",
        ))
        veto._cloud_client = mock_cloud_client

        wrapped = veto.wrap([tool])
        # In log mode, this should NOT raise an exception
        result = await wrapped[0].handler({})
        assert result == "executed"


class TestCloudValidation:
    """Tests for cloud validation integration."""

    async def test_passes_arguments_to_cloud(self, mock_cloud_client):
        """Should pass tool arguments to cloud for validation."""

        class MockTool:
            name = "validate_args_tool"
            description = "Tool to test argument passing"

            async def handler(self, args):
                return "ok"

        tool = MockTool()
        veto = await Veto.init(VetoOptions(api_key="test", log_level="silent"))
        veto._cloud_client = mock_cloud_client

        wrapped = veto.wrap([tool])
        await wrapped[0].handler({"amount": 500, "currency": "USD"})

        # Verify validate was called with the arguments
        mock_cloud_client.validate.assert_called_once()
        call_args = mock_cloud_client.validate.call_args
        assert call_args.kwargs["tool_name"] == "validate_args_tool"
        assert call_args.kwargs["arguments"] == {"amount": 500, "currency": "USD"}
