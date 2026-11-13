"""`python -m uab_platform` — prints package info (bootstrap lives in uab_platform.bootstrap)."""

from uab_platform import __version__

print(f"uab-platform {__version__} — control plane for the Universal AI Agent Builder")
print("Entry points: uvicorn uab_platform.api.app:app · uab-bootstrap · see docs/ai-studio-integration.md")
