#!/bin/sh
# Push secrets to Azure Key Vault.
# Usage: ./infra/scripts/setup-secrets.sh
#
# Prompts for any secret whose current value is "initial-rotate-me" or missing.
# Safe to run repeatedly — only updates secrets that need it.

set -e

setup_vault() {
    vault="$1"
    shift
    echo "=== $vault ==="
    for name in "$@"; do
        current=$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv 2>/dev/null || echo "")

        if [ "$current" = "initial-rotate-me" ] || [ -z "$current" ]; then
            printf "Enter value for %s: " "$name"
            read -r value
            if [ -z "$value" ]; then
                echo "Skipping $name (empty input)"
                continue
            fi
            az keyvault secret set --vault-name "$vault" --name "$name" --value "$value" -o none
            echo "Set $name"
        else
            echo "$name already set (use Azure CLI to rotate manually)"
        fi
    done
}

# Shared KV — job encryption only
setup_vault "kv-canonizr-prod" \
    job-encryption-key

# Portal KV — auth, billing, OAuth
setup_vault "kv-portal-canonizr-prod" \
    auth-secret \
    stripe-secret-key \
    github-client-id \
    github-client-secret \
    google-client-id \
    google-client-secret

echo "Done."
