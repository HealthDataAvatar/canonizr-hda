# ---------------------------------------------------------------------------
# Azure Cache for Redis — quota enforcement, usage tracking, job queue
# ---------------------------------------------------------------------------
resource "azurerm_redis_cache" "this" {
  name                = "redis-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  capacity            = 0
  family              = "C"
  sku_name            = "Basic"
  minimum_tls_version = "1.2"
  non_ssl_port_enabled = false
}
