# ---------------------------------------------------------------------------
# Azure OpenAI — used for image captioning
#
# Per-image captioning cost (low-detail: 85 in + ~50 out tokens):
#   gpt-5.4-nano  $0.20/$1.25 per 1M tokens  → ~$0.00008/image
#   gpt-4o        $2.50/$10   per 1M tokens   → ~$0.0007/image
#   Azure Vision  flat $1/1K transactions      → $0.001/image (deprecated 2028-09)
# High-detail (4 tiles, 765 in + ~50 out): nano ~$0.00022, 4o ~$0.0024
# ---------------------------------------------------------------------------
resource "azurerm_cognitive_account" "openai" {
  name                = "oai-${local.prefix}"
  location            = "swedencentral"
  resource_group_name = azurerm_resource_group.this.name
  kind                = "OpenAI"
  sku_name            = "S0"

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_cognitive_deployment" "captioning" {
  name                 = "captioning-global-gpt-5.4-nano"
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = var.openai_model
    version = var.openai_model_version
  }

  sku {
    name     = "GlobalStandard"
    capacity = 10 # TPM in thousands
  }
}
