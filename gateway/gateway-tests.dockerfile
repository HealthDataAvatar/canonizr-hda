FROM python:3.12-slim

RUN apt-get update && apt-get install -y libmagic1 libheif1 libopenjp2-7 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-editable --no-install-project --extra test

COPY app/ ./app/
COPY tests/ ./tests/

CMD ["uv", "run", "--no-project", "pytest", "tests/integration", "-q", "-m", "not smoke", "--junitxml=/reports/junit.xml", "--html=/reports/report.html", "--self-contained-html", "--tb=short"]
