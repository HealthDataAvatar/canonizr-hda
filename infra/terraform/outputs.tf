output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "acr_login_server" {
  value = azurerm_container_registry.this.login_server
}

output "gateway_fqdn" {
  value = azurerm_container_app.gateway.ingress[0].fqdn
}

output "openai_endpoint" {
  value = azurerm_cognitive_account.openai.endpoint
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

output "website_deployment_token" {
  value     = azurerm_static_web_app.website.api_key
  sensitive = true
}

output "website_default_hostname" {
  value = azurerm_static_web_app.website.default_host_name
}
