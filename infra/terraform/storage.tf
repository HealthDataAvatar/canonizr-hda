# ---------------------------------------------------------------------------
# Azure Blob Storage — retained job blobs (input + output, per-user encrypted)
# ---------------------------------------------------------------------------
resource "azurerm_storage_account" "results" {
  name                     = replace("stresults${local.prefix}", "-", "")
  location                 = azurerm_resource_group.this.location
  resource_group_name      = azurerm_resource_group.this.name
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_storage_container" "jobs" {
  name                  = "jobs"
  storage_account_id    = azurerm_storage_account.results.id
  container_access_type = "private"
}

# Hard cap: delete all blobs older than 31 days regardless of application-level retention
resource "azurerm_storage_management_policy" "results_lifecycle" {
  storage_account_id = azurerm_storage_account.results.id

  rule {
    name    = "delete-expired-blobs"
    enabled = true

    filters {
      blob_types   = ["blockBlob"]
      prefix_match = ["jobs/"]
    }

    actions {
      base_blob {
        delete_after_days_since_creation_greater_than = 31
      }
    }
  }
}

# Gateway needs to read/write blobs (encrypt input, decrypt output on /result)
resource "azurerm_role_assignment" "gateway_blob_contributor" {
  scope                = azurerm_storage_account.results.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.gateway.principal_id
}

# Worker needs to read/write blobs (decrypt input, encrypt output)
resource "azurerm_role_assignment" "worker_blob_contributor" {
  scope                = azurerm_storage_account.results.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.worker.principal_id
}

# ---------------------------------------------------------------------------
# Key Vault — kept for portal secrets, APIM credentials, etc.
# Shared encryption key removed — per-user keys live in Table Storage.
# ---------------------------------------------------------------------------
resource "azurerm_key_vault" "this" {
  name                = "kv-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  purge_protection_enabled = false
}

resource "azurerm_key_vault_access_policy" "terraform" {
  key_vault_id = azurerm_key_vault.this.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = data.azurerm_client_config.current.object_id

  secret_permissions = ["Get", "Set", "Delete", "List", "Purge"]
}

resource "azurerm_key_vault_access_policy" "gateway" {
  key_vault_id = azurerm_key_vault.this.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_user_assigned_identity.gateway.principal_id

  secret_permissions = ["Get"]
}

resource "azurerm_key_vault_access_policy" "worker" {
  key_vault_id = azurerm_key_vault.this.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_user_assigned_identity.worker.principal_id

  secret_permissions = ["Get"]
}
