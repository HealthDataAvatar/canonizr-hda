# ---------------------------------------------------------------------------
# Cleanup Job (daily cron)
# Deletes blobs for expired and soft-deleted jobs.
# Same container image as gateway/worker, different entrypoint.
# ---------------------------------------------------------------------------

resource "azurerm_user_assigned_identity" "cleanup" {
  name                = "id-cleanup-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
}

resource "azurerm_role_assignment" "cleanup_blob_contributor" {
  scope                = azurerm_storage_account.results.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.cleanup.principal_id
}

resource "azurerm_role_assignment" "cleanup_table_contributor" {
  scope                = azurerm_storage_account.portal.id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = azurerm_user_assigned_identity.cleanup.principal_id
}

# ---------------------------------------------------------------------------
# Container App Job
# ---------------------------------------------------------------------------
resource "azurerm_container_app_job" "cleanup" {
  name                         = "canonizr-cleanup"
  location                     = azurerm_resource_group.this.location
  resource_group_name          = azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id

  replica_timeout_in_seconds = 300
  replica_retry_limit        = 1

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.cleanup.id]
  }

  registry {
    server               = azurerm_container_registry.this.login_server
    username             = azurerm_container_registry.this.admin_username
    password_secret_name = "acr-password"
  }

  schedule_trigger_config {
    cron_expression          = "0 3 * * *" # Daily at 03:00 UTC
    parallelism              = 1
    replica_completion_count = 1
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.this.admin_password
  }

  template {
    container {
      name    = "cleanup"
      image   = "${azurerm_container_registry.this.login_server}/canonizr-gateway:latest"
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["uv", "run", "python", "-m", "app.cleanup"]

      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.cleanup.client_id
      }

      env {
        name  = "BLOB_STORAGE_URL"
        value = azurerm_storage_account.results.primary_blob_endpoint
      }

      env {
        name  = "TABLE_STORAGE_URL"
        value = azurerm_storage_account.portal.primary_table_endpoint
      }
    }
  }
}
