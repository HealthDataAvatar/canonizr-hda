# ---------------------------------------------------------------------------
# Container Apps Environment
# ---------------------------------------------------------------------------
resource "azurerm_container_app_environment" "this" {
  name                       = "cae-${local.prefix}"
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
}

# ---------------------------------------------------------------------------
# Docling (upstream image, no build needed)
# ---------------------------------------------------------------------------
resource "azurerm_container_app" "docling" {
  name                         = "canonizr-docling"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "docling"
      image  = "ghcr.io/docling-project/docling-serve-cpu:latest"
      cpu    = var.docling_cpu
      memory = var.docling_memory

      liveness_probe {
        transport = "HTTP"
        path      = "/docs"
        port      = 5001
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/docs"
        port      = 5001
      }
    }
  }

  # Internal only — gateway talks to it, not the internet
  ingress {
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
    target_port      = 5001
    transport        = "http"
    external_enabled = false
  }
}

# ---------------------------------------------------------------------------
# Gateway (custom image from ACR)
# ---------------------------------------------------------------------------
resource "azurerm_container_app" "gateway" {
  name                         = "canonizr-gateway"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"

  registry {
    server               = azurerm_container_registry.this.login_server
    username             = azurerm_container_registry.this.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.this.admin_password
  }

  secret {
    name  = "openai-api-key"
    value = azurerm_cognitive_account.openai.primary_access_key
  }

  template {
    min_replicas = 1
    max_replicas = 5

    container {
      name   = "gateway"
      image  = "${azurerm_container_registry.this.login_server}/canonizr-gateway:latest"
      cpu    = var.gateway_cpu
      memory = var.gateway_memory

      env {
        name  = "LIBREOFFICE_ENABLED"
        value = "false"
      }

      env {
        name  = "CAPTIONING_ENABLED"
        value = "true"
      }

      env {
        name  = "CAPTIONING_ENDPOINT"
        value = "${azurerm_cognitive_account.openai.endpoint}openai/deployments/${azurerm_cognitive_deployment.captioning.name}/chat/completions?api-version=2024-10-21"
      }

      env {
        name        = "CAPTIONING_API_KEY"
        secret_name = "openai-api-key"
      }

      env {
        name  = "CAPTIONING_API_MODEL"
        value = var.openai_model
      }

      env {
        name  = "CAPTIONING_API_PARAMS"
        value = "{\"max_completion_tokens\":1024}"
      }

      # Docling is reachable via the internal FQDN within the Container Apps environment
      env {
        name  = "DOCLING_ENDPOINT"
        value = "https://canonizr-docling.internal.${azurerm_container_app_environment.this.default_domain}/v1/convert/file"
      }

      liveness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8000
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8000
      }
    }
  }

  ingress {
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
    target_port      = 8000
    transport        = "http"
    external_enabled = true
  }
}
