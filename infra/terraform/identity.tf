# ---------------------------------------------------------------------------
# User-assigned managed identities — created before containers and Key Vault
# policies, avoiding circular dependencies.
# ---------------------------------------------------------------------------
resource "azurerm_user_assigned_identity" "gateway" {
  name                = "id-gateway-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
}

resource "azurerm_user_assigned_identity" "worker" {
  name                = "id-worker-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
}
