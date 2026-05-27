ACR_NAME    ?= acrcanonizrprod
ACR_SERVER  ?= $(ACR_NAME).azurecr.io
IMAGE_NAME  ?= canonizr-gateway
TAG         ?= latest
TF_DIR      ?= infra/terraform
DEPLOY_TIME ?= $(shell date -u +%Y%m%dT%H%M%SZ)

.PHONY: build push deploy test test-unit test-integration check-uv fmt lint check install-hooks gateway-logs worker-logs

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
check-uv:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is not installed. See https://docs.astral.sh/uv/getting-started/installation/"; exit 1; }

install-hooks:
	@mkdir -p .git/hooks
	cp hooks/pre-commit .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit
	@echo "Hooks installed."

check-hooks:
	@cmp -s hooks/pre-commit .git/hooks/pre-commit 2>/dev/null || { echo "Error: hooks out of date. Run: make install-hooks"; exit 1; }

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
fmt: check-uv
	cd gateway && uv sync --extra lint && uv run ruff format app/ tests/

lint: check-uv
	cd gateway && uv sync --extra lint && uv run ruff format --check app/ tests/ && uv run ruff check app/ tests/ && uv run pyright app/

test-unit: check-uv
	cd gateway && uv sync --extra test && uv run pytest tests/unit -q

check: lint test-unit

test-integration:
	docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
	docker compose -f docker-compose.test.yml down -v

test: test-unit test-integration

# ---------------------------------------------------------------------------
# Build & deploy
# ---------------------------------------------------------------------------
build:
	docker build --platform linux/amd64 \
		-t $(ACR_SERVER)/$(IMAGE_NAME):$(TAG) \
		-f gateway/gateway.dockerfile gateway/

push: build
	az acr login --name $(ACR_NAME)
	docker push $(ACR_SERVER)/$(IMAGE_NAME):$(TAG)

deploy: push
	tofu -chdir=$(TF_DIR) apply -var="deploy_time=$(DEPLOY_TIME)" -auto-approve

# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------
gateway-logs:
	az containerapp logs show --name canonizr-gateway --resource-group rg-canonizr-prod --tail 50

worker-logs:
	az containerapp logs show --name canonizr-worker --resource-group rg-canonizr-prod --tail 50