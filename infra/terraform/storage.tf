# ---------------------------------------------------------------------------
# Azure Storage — shared file mount for encrypted job blobs
# ---------------------------------------------------------------------------
resource "azurerm_storage_account" "blobs" {
  name                     = replace("st${local.prefix}", "-", "")
  location                 = azurerm_resource_group.this.location
  resource_group_name      = azurerm_resource_group.this.name
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_storage_share" "jobs" {
  name               = "jobs"
  storage_account_id = azurerm_storage_account.blobs.id
  quota              = 1 # GB — blobs are ephemeral, 1GB is plenty
}

# ---------------------------------------------------------------------------
# Key Vault — encryption key for job data at rest
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

  secret_permissions = ["Get", "Set", "Delete", "List"]
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

resource "azurerm_key_vault_secret" "encryption_key" {
  name         = "job-encryption-key"
  value        = "initial-rotate-me"
  key_vault_id = azurerm_key_vault.this.id

  depends_on = [azurerm_key_vault_access_policy.terraform]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "stripe_secret_key" {
  name         = "stripe-secret-key"
  value        = "initial-rotate-me"
  key_vault_id = azurerm_key_vault.this.id

  depends_on = [azurerm_key_vault_access_policy.terraform]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "stripe_webhook_secret" {
  name         = "stripe-webhook-secret"
  value        = "initial-rotate-me"
  key_vault_id = azurerm_key_vault.this.id

  depends_on = [azurerm_key_vault_access_policy.terraform]

  lifecycle {
    ignore_changes = [value]
  }
}
