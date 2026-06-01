FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-editable --extra test

COPY app/ ./app/
COPY tests/ ./tests/

CMD ["uv", "run", "pytest", "tests/integration", "-q", "-m", "not smoke", "--junitxml=/reports/junit.xml", "--html=/reports/report.html", "--self-contained-html", "--tb=short"]
