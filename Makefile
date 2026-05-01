ACR_NAME    ?= acrcanonizrprod
ACR_SERVER  ?= $(ACR_NAME).azurecr.io
IMAGE_NAME  ?= canonizr-gateway
TAG         ?= latest

.PHONY: build push deploy

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