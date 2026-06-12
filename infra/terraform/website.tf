# ---------------------------------------------------------------------------
# Static Web App — marketing website (canonizr.com)
# ---------------------------------------------------------------------------
resource "azurerm_static_web_app" "website" {
  name                = "swa-${local.prefix}"
  location            = "westeurope" # SWA has limited region support
  resource_group_name = azurerm_resource_group.this.name
  sku_tier            = "Free"
  sku_size            = "Free"
}

# Custom domain: canonizr.com
# Bound manually via Azure Portal (apex domains require DNS validation
# that can't be fully automated with GoDaddy/Netlify NS delegation).
# Steps:
#   1. Azure Portal > Static Web App > Custom domains > Add
#   2. Add TXT record to Netlify DNS for validation
#   3. Add ALIAS/ANAME record pointing to the SWA default hostname
#   4. www.canonizr.com: CNAME to the SWA default hostname
