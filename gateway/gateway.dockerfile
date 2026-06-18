FROM python:3.11-slim

RUN apt-get update && apt-get install -y libmagic1 libheif1 libopenjp2-7 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace
COPY pyproject.toml uv.lock ./
RUN uv sync --no-editable --no-install-project

COPY app/ ./app/

CMD ["uv", "run", "--no-project", "uvicorn", "app.app:app", "--host", "0.0.0.0", "--port", "8000"]
