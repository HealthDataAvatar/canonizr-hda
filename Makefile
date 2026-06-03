ACR_NAME    ?= acrcanonizrprod
ACR_SERVER  ?= $(ACR_NAME).azurecr.io
GATEWAY_IMAGE      ?= canonizr-gateway
PORTAL_IMAGE    ?= canonizr-portal
TAG         ?= latest
TF_DIR      ?= infra/terraform
DEPLOY_TIME ?= $(shell date -u +%Y%m%dT%H%M%SZ)

.PHONY: build gateway-push deploy test test-unit test-gateway-unit test-portal-unit test-gateway-integration test-portal-integration test-integration test-smoke test-focus check-uv fmt lint check install-hooks setup-secrets gen-key gateway-logs worker-logs portal-dev portal-build portal-push portal-logs florence-build florence-push florence-logs set-admin

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
check-uv:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is not installed. See https://docs.astral.sh/uv/getting-started/installation/"; exit 1; }
	@cd gateway && uv sync --all-extras -q

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
	cd gateway && uv sync --extra lint && uv run ruff format --check app/ tests/ && uv run ruff check app/ tests/ && uv run pyright app/ tests/

test-gateway-unit: check-uv
	cd gateway && uv sync --extra test --extra lint && uv run pyright app/ tests/ && uv run pytest tests/unit --cov=app --cov-report=term-missing

test-portal-unit:
	cd portal && npx tsc --noEmit
	cd portal && npx vitest run --project unit

test-unit: test-gateway-unit test-portal-unit

test-gateway-integration:
	docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
	docker compose -f docker-compose.test.yml down -v

test-portal-integration:
	docker compose -f docker-compose.portal-test.yml up --build --abort-on-container-exit --exit-code-from tests
	docker compose -f docker-compose.portal-test.yml down -v

test-integration: test-gateway-integration test-portal-integration

test-focus:
	FOCUS_TESTS=1 docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
	docker compose -f docker-compose.test.yml down -v

test-smoke: check-uv
	@test -n "$$APIM_KEY" || { echo "Error: set GATEWAY_URL and APIM_KEY"; exit 1; }
	cd gateway && uv run pytest tests/smoke -q --timeout=120

test: test-unit test-integration
	@echo "Tests started at $(DEPLOY_TIME) passed"

# ---------------------------------------------------------------------------
# Stripe
# ---------------------------------------------------------------------------
stripe-setup: check-uv
	@test -n "$$STRIPE_SECRET_KEY" || { echo "Error: set STRIPE_SECRET_KEY"; exit 1; }
	cd gateway && uv sync && uv run python ../infra/stripe/setup.py

# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
set-admin:
	@test -n "$(EMAIL)" || { echo "Usage: make set-admin EMAIL=you@example.com"; exit 1; }
	@CONN=$$(az storage account show-connection-string -g rg-canonizr-prod -n stportalcanonizrprod --query connectionString -o tsv) && \
	USER_ID=$$(az storage entity query --table-name Users --filter "PartitionKey eq 'email' and RowKey eq '$(EMAIL)'" --connection-string "$$CONN" --query "items[0].userId" -o tsv) && \
	test -n "$$USER_ID" || { echo "Error: user $(EMAIL) not found"; exit 1; } && \
	INVERTED_TS=$$(python3 -c "import time; print(str(9999999999999 - int(time.time() * 1000)).zfill(13))") && \
	az storage entity insert --table-name UserPermissions --entity \
		PartitionKey=$$USER_ID \
		RowKey=$${INVERTED_TS}_admin \
		timestamp=$$(date -u +%Y-%m-%dT%H:%M:%SZ) \
		isAdmin@odata.type=Edm.Boolean isAdmin=true \
		blocked@odata.type=Edm.Boolean blocked=false \
		stripeCustomerId="" \
		changedBy=manual \
		--connection-string "$$CONN" && \
	echo "✓ $(EMAIL) ($$USER_ID) is now admin"

# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------
gen-key:
	@openssl rand -hex 32

setup-secrets:
	./infra/scripts/setup-secrets.sh

# ---------------------------------------------------------------------------
# Build & deploy
# ---------------------------------------------------------------------------
build:
	docker build --platform linux/amd64 \
		-t $(ACR_SERVER)/$(GATEWAY_IMAGE):$(TAG) \
		-f gateway/gateway.dockerfile gateway/

gateway-push: build
	az acr login --name $(ACR_NAME)
	docker push $(ACR_SERVER)/$(GATEWAY_IMAGE):$(TAG)

deploy: test gateway-push portal-push
	tofu -chdir=$(TF_DIR) apply -var="deploy_time=$(DEPLOY_TIME)"

# ---------------------------------------------------------------------------
# Portal
# ---------------------------------------------------------------------------
portal-dev:
	docker compose -f docker-compose.portal-test.yml up azurite redis mail-stub gateway apim-stub -d --wait
	docker compose -f docker-compose.portal-test.yml logs -f mail-stub gateway &
	cd portal && npm run dev; \
	docker compose -f docker-compose.portal-test.yml down

portal-build:
	docker build --platform linux/amd64 \
		-t $(ACR_SERVER)/$(PORTAL_IMAGE):$(TAG) \
		-f portal/Dockerfile portal/

portal-push: portal-build
	az acr login --name $(ACR_NAME)
	docker push $(ACR_SERVER)/$(PORTAL_IMAGE):$(TAG)

# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------
gateway-logs:
	az containerapp logs show --name canonizr-gateway --resource-group rg-canonizr-prod --tail 50

worker-logs:
	az containerapp logs show --name canonizr-worker --resource-group rg-canonizr-prod --tail 50

portal-logs:
	az containerapp logs show --name canonizr-portal --resource-group rg-canonizr-prod --tail 50
