# ---------------------------------------------------------------------------
# Azure Managed Redis — quota enforcement, usage tracking, job queue
# ---------------------------------------------------------------------------
resource "azurerm_managed_redis" "this" {
  name                = "redis-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku_name            = "Balanced_B0"

  default_database {
    access_keys_authentication_enabled = true
  }
}
