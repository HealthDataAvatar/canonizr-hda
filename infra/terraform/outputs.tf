output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "acr_login_server" {
  value = azurerm_container_registry.this.login_server
}

output "gateway_fqdn" {
  value = azurerm_container_app.gateway.ingress[0].fqdn
}

output "apim_gateway_url" {
  value = azurerm_api_management.this.gateway_url
}

output "apim_developer_portal_url" {
  value = azurerm_api_management.this.developer_portal_url
}

output "openai_endpoint" {
  value = azurerm_cognitive_account.openai.endpoint
}

output "app_insights_connection_string" {
  value     = azurerm_application_insights.this.connection_string
  sensitive = true
}

output "redis_hostname" {
  value = azurerm_managed_redis.this.hostname
}

output "portal_fqdn" {
  value = azurerm_container_app.portal.ingress[0].fqdn
}

output "portal_storage_account" {
  value = azurerm_storage_account.portal.name
}

output "portal_key_vault_name" {
  value = azurerm_key_vault.portal.name
}

output "results_storage_account" {
  value = azurerm_storage_account.results.name
}
