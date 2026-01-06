"""
Custom LLM provider client for validation.
"""

from typing import Any
from dataclasses import dataclass
import json
import re

from veto.utils.logger import Logger
from veto.rules.types import Rule
from veto.custom.types import (
    CustomConfig,
    CustomResponse,
    CustomToolCall,
    CustomError,
    CustomParseError,
    resolve_custom_config,
)
from veto.custom.prompt import build_user_prompt, build_provider_messages


@dataclass
class CustomClientOptions:
    """Options for creating a custom client."""

    config: CustomConfig
    logger: Logger


class CustomClient:
    """Client for custom LLM provider validation."""

    def __init__(self, options: CustomClientOptions):
        self.config = resolve_custom_config(options.config)
        self.logger = options.logger

        self.logger.debug(
            "Custom client initialized",
            {
                "provider": self.config.provider,
                "model": self.config.model,
                "temperature": self.config.temperature,
            },
        )

    async def evaluate(
        self, tool_call: CustomToolCall, rules: list[Rule]
    ) -> CustomResponse:
        """
        Evaluate a tool call against rules using the custom LLM provider.

        Args:
            tool_call: The tool call to evaluate
            rules: Rules to evaluate against

        Returns:
            Custom response with decision and weights
        """
        user_prompt = build_user_prompt(tool_call, rules)
        messages = build_provider_messages(self.config.provider, user_prompt)

        self.logger.debug(
            "Evaluating tool call with custom provider",
            {
                "provider": self.config.provider,
                "tool": tool_call.tool,
                "rule_count": len(rules),
            },
        )

        try:
            # Route to appropriate provider
            content = await self._call_provider(messages)
            return self._parse_response(content)
        except (CustomError, CustomParseError):
            raise
        except Exception as error:
            raise CustomError(
                f"Custom validation failed: {str(error)}",
                error if isinstance(error, Exception) else None,
            )

    async def _call_provider(self, messages: Any) -> str:
        """
        Call the appropriate provider based on configuration.

        Args:
            messages: Provider-specific message structure

        Returns:
            Raw text response from provider
        """
        if self.config.provider == "openai":
            return await self._call_openai(messages)
        elif self.config.provider == "anthropic":
            return await self._call_anthropic(messages)
        elif self.config.provider == "gemini":
            return await self._call_gemini(messages)
        elif self.config.provider == "openrouter":
            return await self._call_openrouter(messages)
        else:
            raise CustomError(f"Unsupported provider: {self.config.provider}")

    async def _call_openai(self, messages: Any) -> str:
        """Call OpenAI API with the given prompt."""
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(
                api_key=self.config.api_key,
                base_url=self.config.base_url,
            )

            self.logger.debug(
                "Calling OpenAI API",
                {
                    "model": self.config.model,
                    "temperature": self.config.temperature,
                    "max_tokens": self.config.max_tokens,
                },
            )

            response = await client.chat.completions.create(
                model=self.config.model,
                messages=messages.messages,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            if not content:
                raise CustomError("Empty response from OpenAI")

            return str(content)
        except ImportError:
            raise CustomError(
                "OpenAI package not installed. Install with: pip install veto[openai]"
            )
        except CustomError:
            raise
        except Exception as error:
            raise CustomError(
                f"OpenAI API call failed: {str(error)}",
                error if isinstance(error, Exception) else None,
            )

    async def _call_anthropic(self, messages: Any) -> str:
        """Call Anthropic API with the given prompt."""
        try:
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic(api_key=self.config.api_key)

            self.logger.debug(
                "Calling Anthropic API",
                {
                    "model": self.config.model,
                    "temperature": self.config.temperature,
                    "max_tokens": self.config.max_tokens,
                },
            )

            response = await client.messages.create(
                model=self.config.model,
                system=messages.system,
                messages=messages.messages,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
            )

            content = response.content[0]
            if content.type != "text":
                raise CustomError("Unexpected response type from Anthropic")

            return str(content.text)
        except ImportError:
            raise CustomError(
                "Anthropic package not installed. Install with: pip install veto[anthropic]"
            )
        except CustomError:
            raise
        except Exception as error:
            raise CustomError(
                f"Anthropic API call failed: {str(error)}",
                error if isinstance(error, Exception) else None,
            )

    async def _call_gemini(self, messages: Any) -> str:
        """Call Google Gemini API with the given prompt."""
        try:
            from google import genai

            client = genai.Client(api_key=self.config.api_key)

            # Extract text from Gemini content format
            text_content = (
                messages.contents[0]["parts"][0]["text"]
                if messages.contents
                else ""
            )

            self.logger.debug(
                "Calling Gemini API",
                {
                    "model": self.config.model,
                    "temperature": self.config.temperature,
                    "max_tokens": self.config.max_tokens,
                },
            )

            response = await client.aio.models.generate_content(
                model=self.config.model,
                contents=text_content,
                config={
                    "temperature": self.config.temperature,
                    "max_output_tokens": self.config.max_tokens,
                    "response_mime_type": "application/json",
                    "response_schema": {
                        "type": "object",
                        "properties": {
                            "pass_weight": {
                                "type": "number",
                                "description": "Weight for pass decision (0-1)",
                            },
                            "block_weight": {
                                "type": "number",
                                "description": "Weight for block decision (0-1)",
                            },
                            "decision": {
                                "type": "string",
                                "enum": ["pass", "block"],
                                "description": "The validation decision",
                            },
                            "reasoning": {
                                "type": "string",
                                "description": "Brief explanation of the decision",
                            },
                        },
                        "required": [
                            "pass_weight",
                            "block_weight",
                            "decision",
                            "reasoning",
                        ],
                    },
                },
            )

            text = response.text
            if not text:
                raise CustomError("Empty response from Gemini")

            return str(text)
        except ImportError:
            raise CustomError(
                "Google GenAI package not installed. Install with: pip install veto[gemini]"
            )
        except CustomError:
            raise
        except Exception as error:
            raise CustomError(
                f"Gemini API call failed: {str(error)}",
                error if isinstance(error, Exception) else None,
            )

    async def _call_openrouter(self, messages: Any) -> str:
        """
        Call OpenRouter API with the given prompt.

        OpenRouter uses the same API format as OpenAI, so we delegate to _call_openai.
        """
        return await self._call_openai(messages)

    def _parse_response(self, content: str) -> CustomResponse:
        """
        Parse LLM response into structured format.

        Args:
            content: Raw response from LLM

        Returns:
            Parsed custom response
        """
        self.logger.debug("Raw custom provider response:", {"raw_content": content})

        # Extract JSON from response (model might include extra text)
        json_match = re.search(r"\{[\s\S]*\}", content)
        if not json_match:
            raise CustomParseError("No JSON found in response", content)

        try:
            parsed = json.loads(json_match.group(0))
        except json.JSONDecodeError:
            raise CustomParseError("Invalid JSON in response", content)

        # Validate required fields
        if not parsed or not isinstance(parsed, dict):
            raise CustomParseError("Response is not an object", content)

        if not isinstance(parsed.get("pass_weight"), (int, float)):
            raise CustomParseError("Missing or invalid pass_weight", content)
        if not isinstance(parsed.get("block_weight"), (int, float)):
            raise CustomParseError("Missing or invalid block_weight", content)
        if parsed.get("decision") not in ("pass", "block"):
            raise CustomParseError("Missing or invalid decision", content)
        if not isinstance(parsed.get("reasoning"), str):
            raise CustomParseError("Missing or invalid reasoning", content)

        result = CustomResponse(
            pass_weight=float(parsed["pass_weight"]),
            block_weight=float(parsed["block_weight"]),
            decision=parsed["decision"],
            reasoning=parsed["reasoning"],
        )

        if isinstance(parsed.get("matched_rules"), list):
            result.matched_rules = [
                r for r in parsed["matched_rules"] if isinstance(r, str)
            ]

        self.logger.debug(
            "Custom response parsed",
            {
                "decision": result.decision,
                "pass_weight": result.pass_weight,
                "block_weight": result.block_weight,
            },
        )

        return result

    async def health_check(self) -> bool:
        """
        Check if the custom provider is available and working.

        Returns:
            True if health check passes
        """
        try:
            test_tool_call = CustomToolCall(
                tool="health_check",
                arguments={},
            )
            await self.evaluate(test_tool_call, [])
            return True
        except Exception:
            return False


def create_custom_client(options: CustomClientOptions) -> CustomClient:
    """
    Create a new custom client.

    Args:
        options: Client options

    Returns:
        New custom client instance
    """
    return CustomClient(options)
