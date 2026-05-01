# ---------------------------------------------------------------------------
# API Management
# ---------------------------------------------------------------------------
resource "azurerm_api_management" "this" {
  name                = "apim-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  publisher_name      = var.apim_publisher_name
  publisher_email     = var.apim_publisher_email
  sku_name            = var.apim_sku

  identity {
    type = "SystemAssigned"
  }
}

# ---------------------------------------------------------------------------
# APIM Logger → Log Analytics
# ---------------------------------------------------------------------------
resource "azurerm_api_management_logger" "analytics" {
  name                = "log-analytics"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  resource_id         = azurerm_log_analytics_workspace.this.id

  application_insights {
    instrumentation_key = azurerm_application_insights.this.instrumentation_key
  }
}

resource "azurerm_application_insights" "this" {
  name                = "appi-${local.prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  workspace_id        = azurerm_log_analytics_workspace.this.id
  application_type    = "web"
}

# ---------------------------------------------------------------------------
# APIM Diagnostic — log all requests for billing
# ---------------------------------------------------------------------------
resource "azurerm_api_management_diagnostic" "all" {
  identifier               = "applicationinsights"
  api_management_name      = azurerm_api_management.this.name
  resource_group_name      = azurerm_resource_group.this.name
  api_management_logger_id = azurerm_api_management_logger.analytics.id

  sampling_percentage = 100

  frontend_request {
    body_bytes = 0
    headers_to_log = ["Content-Length", "Content-Type"]
  }

  frontend_response {
    body_bytes = 0
    headers_to_log = ["Content-Length", "Content-Type"]
  }

  backend_request {
    body_bytes = 0
    headers_to_log = ["Content-Length"]
  }

  backend_response {
    body_bytes = 0
    headers_to_log = [
      "Content-Length",
      "X-Input-Size-Bytes",
      "X-Images-Captioned",
      "X-Document-Hash",
      "X-Processing-Pipeline",
    ]
  }
}

# ---------------------------------------------------------------------------
# API definition — proxies to the Container App gateway
# ---------------------------------------------------------------------------
resource "azurerm_api_management_api" "canonizr" {
  name                = "canonizr"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  revision            = "1"
  display_name        = "Canonizr"
  path                = ""
  protocols           = ["https"]

  service_url = "https://${azurerm_container_app.gateway.ingress[0].fqdn}"
}

resource "azurerm_api_management_api_operation" "convert" {
  operation_id        = "convert"
  api_name            = azurerm_api_management_api.canonizr.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  display_name        = "Convert Document"
  method              = "POST"
  url_template        = "/convert"
}

resource "azurerm_api_management_api_operation" "health" {
  operation_id        = "health"
  api_name            = azurerm_api_management_api.canonizr.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  display_name        = "Health Check"
  method              = "GET"
  url_template        = "/health"
}

# ---------------------------------------------------------------------------
# Products (subscription tiers)
# ---------------------------------------------------------------------------

# Internal — free, unlimited, for Health Data Avatar
resource "azurerm_api_management_product" "internal" {
  product_id            = "internal"
  api_management_name   = azurerm_api_management.this.name
  resource_group_name   = azurerm_resource_group.this.name
  display_name          = "Internal (HDA)"
  description           = "Free internal access for Health Data Avatar"
  subscription_required = true
  subscriptions_limit   = 1
  approval_required     = true
  published             = true
}

resource "azurerm_api_management_product_api" "internal" {
  api_name            = azurerm_api_management_api.canonizr.name
  product_id          = azurerm_api_management_product.internal.product_id
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
}

# Paid — metered, for external customers
resource "azurerm_api_management_product" "paid" {
  product_id            = "paid"
  api_management_name   = azurerm_api_management.this.name
  resource_group_name   = azurerm_resource_group.this.name
  display_name          = "Paid"
  description           = "Metered access — billed per KB processed"
  subscription_required = true
  subscriptions_limit   = 5
  approval_required     = true
  published             = true
}

resource "azurerm_api_management_product_api" "paid" {
  api_name            = azurerm_api_management_api.canonizr.name
  product_id          = azurerm_api_management_product.paid.product_id
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
}

# ---------------------------------------------------------------------------
# APIM Policy — log request size as custom dimension for billing
# ---------------------------------------------------------------------------
resource "azurerm_api_management_api_policy" "canonizr" {
  api_name            = azurerm_api_management_api.canonizr.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name

  xml_content = <<-XML
    <policies>
      <inbound>
        <base />
        <set-header name="X-Subscription-Id" exists-action="override">
          <value>@(context.Subscription.Id)</value>
        </set-header>
        <set-header name="X-Product-Id" exists-action="override">
          <value>@(context.Product.Id)</value>
        </set-header>
      </inbound>
      <backend>
        <base />
      </backend>
      <outbound>
        <base />
      </outbound>
      <on-error>
        <base />
      </on-error>
    </policies>
  XML
}
