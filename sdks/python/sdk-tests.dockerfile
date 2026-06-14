FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace
COPY pyproject.toml uv.lock ./
RUN uv sync --no-editable --no-install-project --extra test --extra mcp --extra integration

COPY src/ ./src/
COPY tests/ ./tests/
RUN uv sync --no-editable --extra test --extra mcp --extra integration

CMD ["uv", "run", "pytest", "tests/integration", "-q", "--tb=short"]
