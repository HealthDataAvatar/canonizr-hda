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
# Encryption key for job data at rest
# ---------------------------------------------------------------------------
resource "random_bytes" "encryption_key" {
  length = 32
}
