# ---------------------------------------------------------------------------
# Azure Communication Services — Email (sign-in links)
# ---------------------------------------------------------------------------

resource "azurerm_email_communication_service" "this" {
  name                = "email-${local.prefix}"
  resource_group_name = azurerm_resource_group.this.name
  data_location       = "UK"
}

# Azure-managed domain (*.azurecomm.net) — works immediately, no DNS needed.
# Replace with a custom domain once DNS records are verified.
resource "azurerm_email_communication_service_domain" "azure_managed" {
  name             = "AzureManagedDomain"
  email_service_id = azurerm_email_communication_service.this.id
  domain_management = "AzureManaged"
}

resource "azurerm_communication_service" "this" {
  name                = "comms-${local.prefix}"
  resource_group_name = azurerm_resource_group.this.name
  data_location       = "UK"
}

# Link the email domain to the communication service
resource "azurerm_communication_service_email_domain_association" "this" {
  communication_service_id = azurerm_communication_service.this.id
  email_service_domain_id  = azurerm_email_communication_service_domain.azure_managed.id
}

# Store the connection string in the portal Key Vault
resource "azurerm_key_vault_secret" "comms_connection_string" {
  name         = "comms-connection-string"
  value        = azurerm_communication_service.this.primary_connection_string
  key_vault_id = azurerm_key_vault.portal.id
  depends_on   = [azurerm_key_vault_access_policy.portal_terraform]
}
