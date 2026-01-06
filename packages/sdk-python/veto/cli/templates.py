"""
Default templates for veto init.
"""

# Default veto.config.yaml content
DEFAULT_CONFIG = """# Veto Configuration
# See README.md for documentation

version: "1.0"

# Operating mode:
#   "strict" - Block tool calls when validation fails
#   "log"    - Only log validation failures, allow calls to proceed
mode: "strict"

# Validation mode:
#   "api"    - Use external HTTP API (default)
#   "custom" - Use specified LLM provider
validation:
  mode: "api"

# Validation API endpoint (for mode: "api")
api:
  baseUrl: "http://localhost:8080"
  endpoint: "/tool/call/check"
  timeout: 10000
  retries: 2
  retryDelay: 1000

# Custom LLM provider (for mode: "custom")
# custom:
#   provider: "openai"  # openai | anthropic | gemini | openrouter
#   model: "gpt-4o"
#   # apiKey: "sk-..."  # Or set OPENAI_API_KEY env var
#   temperature: 0.1
#   maxTokens: 500
#   # baseUrl: "https://api.openai.com/v1"  # Optional override

# Logging
logging:
  level: "info"  # debug, info, warn, error, silent

# Rules configuration
rules:
  directory: "./rules"
  recursive: true
"""

# Default rules/defaults.yaml content
DEFAULT_RULES = """# Veto Default Rules
# Add your rules here. Create additional .yaml files for organization.

version: "1.0"
name: default-rules
description: Default security rules

rules:
  # Block access to system directories
  - id: block-system-paths
    name: Block system path access
    description: Prevent access to sensitive system directories
    enabled: true
    severity: critical
    action: block
    tools:
      - read_file
      - write_file
      - delete_file
    conditions:
      - field: arguments.path
        operator: starts_with
        value: /etc

  # Block access to root home
  - id: block-root-home
    name: Block root home access
    description: Prevent access to root user directory
    enabled: true
    severity: critical
    action: block
    tools:
      - read_file
      - write_file
      - delete_file
    conditions:
      - field: arguments.path
        operator: starts_with
        value: /root

  # Block destructive commands
  - id: block-rm-rf
    name: Block rm -rf
    description: Prevent recursive forced deletion
    enabled: true
    severity: critical
    action: block
    tools:
      - execute_command
      - run_shell
      - bash
    conditions:
      - field: arguments.command
        operator: contains
        value: "rm -rf"

  # Block privilege escalation
  - id: block-sudo
    name: Block sudo
    description: Prevent privilege escalation
    enabled: true
    severity: critical
    action: block
    tools:
      - execute_command
      - run_shell
      - bash
    conditions:
      - field: arguments.command
        operator: starts_with
        value: sudo
"""

# .gitignore additions for veto
GITIGNORE_ADDITIONS = """
# Veto
veto/.env
veto/*.local.yaml
"""

# Example .env file content
ENV_EXAMPLE = """# Veto Environment Variables
# Copy this to .env and fill in values

# Override log level (debug, info, warn, error, silent)
# VETO_LOG_LEVEL=debug

# Session/Agent tracking (optional)
# VETO_SESSION_ID=
# VETO_AGENT_ID=

# Custom LLM Provider API Keys (for validation.mode: "custom")
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=...
# OPENROUTER_API_KEY=sk-or-...
"""
