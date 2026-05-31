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
      "X-Processing-Time-Ms",
      "X-Captioning-Prompt-Tokens",
      "X-Captioning-Completion-Tokens",
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

resource "azurerm_api_management_api_operation" "create_job" {
  operation_id        = "create-job"
  api_name            = azurerm_api_management_api.canonizr.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  display_name        = "Create Job"
  method              = "POST"
  url_template        = "/v1/jobs"
}

resource "azurerm_api_management_api_operation" "get_job" {
  operation_id        = "get-job"
  api_name            = azurerm_api_management_api.canonizr.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  display_name        = "Get Job"
  method              = "GET"
  url_template        = "/v1/jobs/{jobId}"

  template_parameter {
    name     = "jobId"
    required = true
    type     = "string"
  }
}

resource "azurerm_api_management_api_operation" "delete_job" {
  operation_id        = "delete-job"
  api_name            = azurerm_api_management_api.canonizr.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  display_name        = "Delete Job"
  method              = "DELETE"
  url_template        = "/v1/jobs/{jobId}"

  template_parameter {
    name     = "jobId"
    required = true
    type     = "string"
  }
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
  subscriptions_limit   = 100
  approval_required     = false
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
        <cors allow-credentials="false">
          <allowed-origins>
            <origin>https://portal.canonizr.com</origin>
          </allowed-origins>
          <allowed-methods>
            <method>GET</method>
            <method>POST</method>
            <method>DELETE</method>
          </allowed-methods>
          <allowed-headers>
            <header>Content-Type</header>
            <header>Ocp-Apim-Subscription-Key</header>
          </allowed-headers>
          <expose-headers>
            <header>X-Input-Size-Bytes</header>
            <header>X-Document-Hash</header>
            <header>X-Processing-Time-Ms</header>
            <header>X-Billable-Units</header>
          </expose-headers>
        </cors>
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
        <!-- Forward billing headers to client for transparency -->
        <set-header name="X-Input-Size-Bytes" exists-action="skip">
          <value>@(context.Response.Headers.GetValueOrDefault("X-Input-Size-Bytes", ""))</value>
        </set-header>
        <set-header name="X-Document-Hash" exists-action="skip">
          <value>@(context.Response.Headers.GetValueOrDefault("X-Document-Hash", ""))</value>
        </set-header>
        <set-header name="X-Processing-Time-Ms" exists-action="skip">
          <value>@(context.Response.Headers.GetValueOrDefault("X-Processing-Time-Ms", ""))</value>
        </set-header>
        <set-header name="X-Billable-Units" exists-action="skip">
          <value>@{
            var bytes = context.Response.Headers.GetValueOrDefault("X-Input-Size-Bytes", "0");
            int inputBytes;
            int.TryParse(bytes, out inputBytes);
            return ((int)Math.Ceiling(inputBytes / 100000.0)).ToString();
          }</value>
        </set-header>
      </outbound>
      <on-error>
        <base />
      </on-error>
    </policies>
  XML
}
