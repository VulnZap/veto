"""
CLI module for Veto.
"""

from veto.cli.init import init, is_initialized, get_veto_dir, InitOptions, InitResult
from veto.cli.templates import (
    DEFAULT_CONFIG,
    DEFAULT_RULES,
    GITIGNORE_ADDITIONS,
    ENV_EXAMPLE,
)

__all__ = [
    "init",
    "is_initialized",
    "get_veto_dir",
    "InitOptions",
    "InitResult",
    "DEFAULT_CONFIG",
    "DEFAULT_RULES",
    "GITIGNORE_ADDITIONS",
    "ENV_EXAMPLE",
    "main",
]


def main() -> None:
    """Main CLI entry point."""
    import sys
    import asyncio

    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help", "help"):
        print(
            """Veto CLI

Usage: veto <command> [options]

Commands:
  init      Initialize Veto in current directory
  version   Show version

Options:
  -h, --help     Show this help message
  --force        Force overwrite existing files
  --quiet        Suppress output
"""
        )
        return

    command = args[0]

    if command == "version":
        print("veto 0.1.0")
        return

    if command == "init":
        force = "--force" in args
        quiet = "--quiet" in args

        result = asyncio.run(
            _async_init(
                InitOptions(
                    force=force,
                    quiet=quiet,
                )
            )
        )

        sys.exit(0 if result.success else 1)

    print(f"Unknown command: {command}")
    print("Run 'veto --help' for usage information.")
    sys.exit(1)


async def _async_init(options: InitOptions) -> InitResult:
    """Async wrapper for init."""
    return await init(options)
