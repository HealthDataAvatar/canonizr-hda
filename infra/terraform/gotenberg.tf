# ---------------------------------------------------------------------------
# Gotenberg — headless LibreOffice for legacy format conversion
# Scale-to-zero: cold start ~30-60s, acceptable for legacy formats.
# Single-threaded conversions; scales horizontally via replicas.
# ---------------------------------------------------------------------------
resource "azurerm_container_app" "gotenberg" {
  name                         = "canonizr-gotenberg"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"

  template {
    min_replicas = 0
    max_replicas = 3

    container {
      name   = "gotenberg"
      image  = "gotenberg/gotenberg:8"
      cpu    = 1.0
      memory = "2Gi"

      # Disable Chromium (we only need LibreOffice) to save memory
      args = [
        "gotenberg",
        "--api-port=3000",
        "--api-timeout=120s",
        "--chromium-disable-routes=true",
      ]

      liveness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 3000
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 3000
      }
    }

    # Scale on HTTP concurrency — one conversion at a time per replica
    http_scale_rule {
      name                = "gotenberg-http"
      concurrent_requests = "1"
    }
  }

  # Internal only — worker talks to it, not the internet
  ingress {
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
    target_port      = 3000
    transport        = "http"
    external_enabled = false
  }
}
