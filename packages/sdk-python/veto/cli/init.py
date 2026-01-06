"""
veto init command implementation.
"""

from typing import Optional
from dataclasses import dataclass, field
from pathlib import Path
import os

from veto.cli.templates import (
    DEFAULT_CONFIG,
    DEFAULT_RULES,
    GITIGNORE_ADDITIONS,
    ENV_EXAMPLE,
)


@dataclass
class InitOptions:
    """Options for the init command."""

    directory: Optional[str] = None
    force: bool = False
    yes: bool = False
    quiet: bool = False


@dataclass
class InitResult:
    """Result of the init command."""

    success: bool = False
    veto_dir: str = ""
    created_files: list[str] = field(default_factory=list)
    skipped_files: list[str] = field(default_factory=list)
    messages: list[str] = field(default_factory=list)


def _log(message: str, quiet: bool) -> None:
    """Print a message to console (unless quiet mode)."""
    if not quiet:
        print(message)


async def init(options: Optional[InitOptions] = None) -> InitResult:
    """
    Initialize Veto in a project.

    Creates the following structure:
    ```
    veto/
      veto.config.yaml    # Main configuration file
      rules/
        defaults.yaml     # Default rules
      .env.example        # Example environment variables
    ```

    Args:
        options: Initialization options

    Returns:
        Result of the initialization
    """
    options = options or InitOptions()

    directory = options.directory or os.getcwd()
    force = options.force
    quiet = options.quiet

    result = InitResult()

    base_dir = Path(directory).resolve()
    veto_dir = base_dir / "veto"
    rules_dir = veto_dir / "rules"

    result.veto_dir = str(veto_dir)

    _log("", quiet)
    _log("Initializing Veto...", quiet)
    _log("", quiet)

    # Check if veto directory already exists
    if veto_dir.exists() and not force:
        config_exists = (veto_dir / "veto.config.yaml").exists()
        if config_exists:
            result.messages.append(
                "Veto is already initialized in this directory. Use --force to overwrite."
            )
            _log("  Veto is already initialized in this directory.", quiet)
            _log("  Use --force to overwrite existing files.", quiet)
            _log("", quiet)
            return result

    try:
        # Create veto directory
        if not veto_dir.exists():
            veto_dir.mkdir(parents=True)
            _log("  Created veto/", quiet)

        # Create rules directory
        if not rules_dir.exists():
            rules_dir.mkdir(parents=True)
            _log("  Created veto/rules/", quiet)

        # Create veto.config.yaml
        config_path = veto_dir / "veto.config.yaml"
        if not config_path.exists() or force:
            config_path.write_text(DEFAULT_CONFIG, encoding="utf-8")
            result.created_files.append("veto/veto.config.yaml")
            _log("  Created veto/veto.config.yaml", quiet)
        else:
            result.skipped_files.append("veto/veto.config.yaml")
            _log("  Skipped veto/veto.config.yaml (already exists)", quiet)

        # Create rules/defaults.yaml
        rules_path = rules_dir / "defaults.yaml"
        if not rules_path.exists() or force:
            rules_path.write_text(DEFAULT_RULES, encoding="utf-8")
            result.created_files.append("veto/rules/defaults.yaml")
            _log("  Created veto/rules/defaults.yaml", quiet)
        else:
            result.skipped_files.append("veto/rules/defaults.yaml")
            _log("  Skipped veto/rules/defaults.yaml (already exists)", quiet)

        # Create .env.example
        env_path = veto_dir / ".env.example"
        if not env_path.exists() or force:
            env_path.write_text(ENV_EXAMPLE, encoding="utf-8")
            result.created_files.append("veto/.env.example")
            _log("  Created veto/.env.example", quiet)
        else:
            result.skipped_files.append("veto/.env.example")
            _log("  Skipped veto/.env.example (already exists)", quiet)

        # Update .gitignore if it exists
        gitignore_path = base_dir / ".gitignore"
        if gitignore_path.exists():
            gitignore_content = gitignore_path.read_text(encoding="utf-8")
            if "veto/.env" not in gitignore_content:
                gitignore_path.write_text(
                    gitignore_content + GITIGNORE_ADDITIONS, encoding="utf-8"
                )
                result.messages.append("Updated .gitignore with Veto entries")
                _log("  Updated .gitignore", quiet)

        result.success = True

        _log("", quiet)
        _log("Veto initialized successfully!", quiet)
        _log("", quiet)
        _log("Next steps:", quiet)
        _log("  1. Configure your API endpoint in veto/veto.config.yaml", quiet)
        _log("  2. Add your validation rules in veto/rules/", quiet)
        _log("  3. Use Veto in your application:", quiet)
        _log("", quiet)
        _log('     from veto import Veto', quiet)
        _log("", quiet)
        _log("     veto = await Veto.init()", quiet)
        _log("     tools = veto.wrap(my_tools)", quiet)
        _log("", quiet)

    except Exception as error:
        result.success = False
        message = str(error)
        result.messages.append(f"Error: {message}")
        _log(f"  Error: {message}", quiet)

    return result


def is_initialized(directory: Optional[str] = None) -> bool:
    """
    Check if Veto is initialized in a directory.

    Args:
        directory: Directory to check

    Returns:
        True if Veto is initialized
    """
    directory = directory or os.getcwd()
    veto_dir = Path(directory).resolve() / "veto"
    config_path = veto_dir / "veto.config.yaml"
    return config_path.exists()


def get_veto_dir(directory: Optional[str] = None) -> Optional[str]:
    """
    Get the Veto directory path for a project.

    Args:
        directory: Project directory

    Returns:
        Path to veto directory, or None if not initialized
    """
    directory = directory or os.getcwd()
    veto_dir = Path(directory).resolve() / "veto"
    if veto_dir.exists():
        return str(veto_dir)
    return None
