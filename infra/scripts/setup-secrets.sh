#!/bin/sh
# Push secrets to Azure Key Vault.
# Usage: ./infra/scripts/setup-secrets.sh
#
# Prompts for any secret whose current value is "initial-rotate-me" or missing.
# Safe to run repeatedly — only updates secrets that need it.

set -e

VAULT_NAME="kv-canonizr-prod"

SECRETS="job-encryption-key stripe-secret-key stripe-webhook-secret"

for name in $SECRETS; do
    current=$(az keyvault secret show --vault-name "$VAULT_NAME" --name "$name" --query value -o tsv 2>/dev/null || echo "")

    if [ "$current" = "initial-rotate-me" ] || [ -z "$current" ]; then
        printf "Enter value for %s: " "$name"
        read -r value
        if [ -z "$value" ]; then
            echo "Skipping $name (empty input)"
            continue
        fi
        az keyvault secret set --vault-name "$VAULT_NAME" --name "$name" --value "$value" -o none
        echo "Set $name"
    else
        echo "$name already set (use Azure CLI to rotate manually)"
    fi
done

echo "Done."
