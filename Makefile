ACR_NAME    ?= acrcanonizrprod
ACR_SERVER  ?= $(ACR_NAME).azurecr.io
IMAGE_NAME  ?= canonizr-gateway
TAG         ?= latest

.PHONY: build push deploy test test-unit test-integration check-uv gateway-logs

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
check-uv:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is not installed. See https://docs.astral.sh/uv/getting-started/installation/"; exit 1; }

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
test-unit: check-uv
	cd gateway && uv sync --extra test && uv run pytest tests/unit -q

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

push:
	az acr login --name $(ACR_NAME)
	docker push $(ACR_SERVER)/$(IMAGE_NAME):$(TAG)

deploy: push
	az containerapp update \
		--name canonizr-gateway \
		--resource-group rg-canonizr-prod \
		--image $(ACR_SERVER)/$(IMAGE_NAME):$(TAG) \

gateway-logs:
	az containerapp logs show --name canonizr-gateway --resource-group rg-canonizr-prod --tail 50