terraform {
  required_version = ">= 1.5"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  # Uncomment and configure when ready for remote state
  # backend "azurerm" {
  #   resource_group_name  = "rg-canonizr-tfstate"
  #   storage_account_name = "stcanonizrtfstate"
  #   container_name       = "tfstate"
  #   key                  = "canonizr.tfstate"
  # }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
