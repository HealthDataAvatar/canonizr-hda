FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace
COPY pyproject.toml uv.lock ./
COPY app/ ./app/
COPY tests/ ./tests/
RUN uv sync --frozen --extra test

CMD ["uv", "run", "pytest", "tests/integration", "-q", "-m", "not smoke", "--junitxml=/reports/junit.xml", "--html=/reports/report.html", "--self-contained-html", "--tb=short"]
