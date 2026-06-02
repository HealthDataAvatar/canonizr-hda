# ---------------------------------------------------------------------------
# Azure OpenAI — used for image captioning
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
