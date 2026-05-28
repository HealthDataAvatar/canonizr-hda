# ---------------------------------------------------------------------------
# Portal — Next.js user portal (auth, dashboard, key management)
# ---------------------------------------------------------------------------

# Dedicated storage account for Table Storage (user records, sessions)
resource "azurerm_storage_account" "portal" {
  name                     = replace("stportal${local.prefix}", "-", "")
  location                 = azurerm_resource_group.this.location
  resource_group_name      = azurerm_resource_group.this.name
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

# Managed identity for portal container
resource "azurerm_user_assigned_identity" "portal" {
  name                = "id-portal-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
}

# ---------------------------------------------------------------------------
# Dedicated Key Vault for portal secrets
# ---------------------------------------------------------------------------
resource "azurerm_key_vault" "portal" {
  name                     = "kv-portal-${local.prefix}"
  location                 = azurerm_resource_group.this.location
  resource_group_name      = azurerm_resource_group.this.name
  tenant_id                = data.azurerm_client_config.current.tenant_id
  sku_name                 = "standard"
  purge_protection_enabled = false
}

# Terraform can seed initial secret values
resource "azurerm_key_vault_access_policy" "portal_terraform" {
  key_vault_id = azurerm_key_vault.portal.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = data.azurerm_client_config.current.object_id

  secret_permissions = ["Get", "Set", "Delete", "List"]
}

# Portal identity can read secrets at container spin-up
resource "azurerm_key_vault_access_policy" "portal_identity" {
  key_vault_id = azurerm_key_vault.portal.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_user_assigned_identity.portal.principal_id

  secret_permissions = ["Get"]
}

# ---------------------------------------------------------------------------
# Secrets (seeded with placeholder, rotated via setup-secrets.sh)
# ---------------------------------------------------------------------------
resource "azurerm_key_vault_secret" "portal_auth_secret" {
  name         = "auth-secret"
  value        = "initial-rotate-me"
  key_vault_id = azurerm_key_vault.portal.id
  depends_on   = [azurerm_key_vault_access_policy.portal_terraform]
  lifecycle { ignore_changes = [value] }
}

resource "azurerm_key_vault_secret" "portal_stripe_secret_key" {
  name         = "stripe-secret-key"
  value        = "initial-rotate-me"
  key_vault_id = azurerm_key_vault.portal.id
  depends_on   = [azurerm_key_vault_access_policy.portal_terraform]
  lifecycle { ignore_changes = [value] }
}

resource "azurerm_key_vault_secret" "portal_github_client_id" {
  name         = "github-client-id"
  value        = "initial-rotate-me"
  key_vault_id = azurerm_key_vault.portal.id
  depends_on   = [azurerm_key_vault_access_policy.portal_terraform]
  lifecycle { ignore_changes = [value] }
}

resource "azurerm_key_vault_secret" "portal_github_client_secret" {
  name         = "github-client-secret"
  value        = "initial-rotate-me"
  key_vault_id = azurerm_key_vault.portal.id
  depends_on   = [azurerm_key_vault_access_policy.portal_terraform]
  lifecycle { ignore_changes = [value] }
}

resource "azurerm_key_vault_secret" "portal_google_client_id" {
  name         = "google-client-id"
  value        = "initial-rotate-me"
  key_vault_id = azurerm_key_vault.portal.id
  depends_on   = [azurerm_key_vault_access_policy.portal_terraform]
  lifecycle { ignore_changes = [value] }
}

resource "azurerm_key_vault_secret" "portal_google_client_secret" {
  name         = "google-client-secret"
  value        = "initial-rotate-me"
  key_vault_id = azurerm_key_vault.portal.id
  depends_on   = [azurerm_key_vault_access_policy.portal_terraform]
  lifecycle { ignore_changes = [value] }
}

# Table Storage connection string — not a user-managed secret, but still
# sensitive, so store in KV rather than Terraform state / env vars.
resource "azurerm_key_vault_secret" "portal_table_storage" {
  name         = "table-storage-connection-string"
  value        = azurerm_storage_account.portal.primary_connection_string
  key_vault_id = azurerm_key_vault.portal.id
  depends_on   = [azurerm_key_vault_access_policy.portal_terraform]
}

# ---------------------------------------------------------------------------
# Portal Container App
# ---------------------------------------------------------------------------
resource "azurerm_container_app" "portal" {
  name                         = "canonizr-portal"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.portal.id]
  }

  registry {
    server               = azurerm_container_registry.this.login_server
    username             = azurerm_container_registry.this.admin_username
    password_secret_name = "acr-password"
  }

  # --- Secrets: all resolved from Key Vault at container spin-up ---

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.this.admin_password
  }

  secret {
    name                = "auth-secret"
    key_vault_secret_id = azurerm_key_vault_secret.portal_auth_secret.versionless_id
    identity            = azurerm_user_assigned_identity.portal.id
  }

  secret {
    name                = "table-storage-connection-string"
    key_vault_secret_id = azurerm_key_vault_secret.portal_table_storage.versionless_id
    identity            = azurerm_user_assigned_identity.portal.id
  }

  secret {
    name                = "stripe-secret-key"
    key_vault_secret_id = azurerm_key_vault_secret.portal_stripe_secret_key.versionless_id
    identity            = azurerm_user_assigned_identity.portal.id
  }

  secret {
    name                = "github-client-id"
    key_vault_secret_id = azurerm_key_vault_secret.portal_github_client_id.versionless_id
    identity            = azurerm_user_assigned_identity.portal.id
  }

  secret {
    name                = "github-client-secret"
    key_vault_secret_id = azurerm_key_vault_secret.portal_github_client_secret.versionless_id
    identity            = azurerm_user_assigned_identity.portal.id
  }

  secret {
    name                = "google-client-id"
    key_vault_secret_id = azurerm_key_vault_secret.portal_google_client_id.versionless_id
    identity            = azurerm_user_assigned_identity.portal.id
  }

  secret {
    name                = "google-client-secret"
    key_vault_secret_id = azurerm_key_vault_secret.portal_google_client_secret.versionless_id
    identity            = azurerm_user_assigned_identity.portal.id
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "portal"
      image  = "${azurerm_container_registry.this.login_server}/canonizr-portal:latest"
      cpu    = var.portal_cpu
      memory = var.portal_memory

      # --- Non-secret config ---

      env {
        name  = "AUTH_URL"
        value = "https://canonizr-portal.${azurerm_container_app_environment.this.default_domain}"
      }

      env {
        name  = "AZURE_SUBSCRIPTION_ID"
        value = var.subscription_id
      }

      env {
        name  = "APIM_RESOURCE_GROUP"
        value = azurerm_resource_group.this.name
      }

      env {
        name  = "APIM_SERVICE_NAME"
        value = azurerm_api_management.this.name
      }

      env {
        name  = "LOG_ANALYTICS_WORKSPACE_ID"
        value = azurerm_log_analytics_workspace.this.id
      }

      env {
        name  = "DEPLOY_TIME"
        value = var.deploy_time
      }

      # --- Secrets injected from Key Vault ---

      env {
        name        = "AUTH_SECRET"
        secret_name = "auth-secret"
      }

      env {
        name        = "TABLE_STORAGE_CONNECTION_STRING"
        secret_name = "table-storage-connection-string"
      }

      env {
        name        = "STRIPE_SECRET_KEY"
        secret_name = "stripe-secret-key"
      }

      env {
        name        = "GITHUB_CLIENT_ID"
        secret_name = "github-client-id"
      }

      env {
        name        = "GITHUB_CLIENT_SECRET"
        secret_name = "github-client-secret"
      }

      env {
        name        = "GOOGLE_CLIENT_ID"
        secret_name = "google-client-id"
      }

      env {
        name        = "GOOGLE_CLIENT_SECRET"
        secret_name = "google-client-secret"
      }

      liveness_probe {
        transport = "HTTP"
        path      = "/"
        port      = 3000
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/"
        port      = 3000
      }
    }
  }

  ingress {
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
    target_port      = 3000
    transport        = "http"
    external_enabled = true
  }
}
