# ---------------------------------------------------------------------------
# Usage Reporter — Container App Job (cron, hourly)
# Queries App Insights, pushes meter events to Stripe.
# Same container image as gateway/worker, different entrypoint.
# ---------------------------------------------------------------------------

# Managed identity
resource "azurerm_user_assigned_identity" "usage_reporter" {
  name                = "id-usage-reporter-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
}

# Table Storage access — reads subscription mappings, watermark, audit log
resource "azurerm_role_assignment" "usage_reporter_table_data" {
  scope                = azurerm_storage_account.portal.id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = azurerm_user_assigned_identity.usage_reporter.principal_id
}

# Portal Key Vault access — Stripe key
resource "azurerm_key_vault_access_policy" "usage_reporter" {
  key_vault_id = azurerm_key_vault.portal.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_user_assigned_identity.usage_reporter.principal_id

  secret_permissions = ["Get"]
}

# ---------------------------------------------------------------------------
# Container App Job
# ---------------------------------------------------------------------------
resource "azurerm_container_app_job" "usage_reporter" {
  name                         = "canonizr-usage-reporter"
  location                     = azurerm_resource_group.this.location
  resource_group_name          = azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id

  replica_timeout_in_seconds = 300
  replica_retry_limit        = 1

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.usage_reporter.id]
  }

  registry {
    server               = azurerm_container_registry.this.login_server
    username             = azurerm_container_registry.this.admin_username
    password_secret_name = "acr-password"
  }

  schedule_trigger_config {
    cron_expression          = "0 * * * *" # Every hour
    parallelism              = 1
    replica_completion_count = 1
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.this.admin_password
  }

  secret {
    name                = "stripe-secret-key"
    key_vault_secret_id = azurerm_key_vault_secret.portal_stripe_secret_key.versionless_id
    identity            = azurerm_user_assigned_identity.usage_reporter.id
  }

  template {
    container {
      name    = "usage-reporter"
      image   = "${azurerm_container_registry.this.login_server}/canonizr-gateway:latest"
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["uv", "run", "python", "-m", "app.usage_report"]

      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.usage_reporter.client_id
      }

      env {
        name  = "TABLE_STORAGE_URL"
        value = azurerm_storage_account.portal.primary_table_endpoint
      }

      env {
        name        = "STRIPE_SECRET_KEY"
        secret_name = "stripe-secret-key"
      }
    }
  }
}
