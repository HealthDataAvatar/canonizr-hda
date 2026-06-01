variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "uksouth"
}

variable "environment" {
  description = "Environment name (e.g. prod, staging)"
  type        = string
  default     = "prod"
}

variable "project" {
  description = "Project name, used as prefix for resource names"
  type        = string
  default     = "canonizr"
}

# APIM
variable "apim_publisher_name" {
  description = "Publisher name shown in the APIM developer portal"
  type        = string
}

variable "apim_publisher_email" {
  description = "Publisher email for APIM notifications"
  type        = string
}

variable "apim_sku" {
  description = "APIM SKU. Use Consumption for low-cost start, Standard for production."
  type        = string
  default     = "Consumption_0"
}

# Container Apps
variable "gateway_cpu" {
  type    = number
  default = 0.5
}

variable "gateway_memory" {
  description = "Gateway memory in Gi"
  type        = string
  default     = "1Gi"
}

variable "docling_cpu" {
  type    = number
  default = 2.0
}

variable "docling_memory" {
  type    = string
  default = "4Gi"
}

# Portal
variable "portal_cpu" {
  type    = number
  default = 0.5
}

variable "portal_memory" {
  type    = string
  default = "1Gi"
}

# Azure OpenAI
variable "deploy_time" {
  description = "Timestamp to force new container revision on deploy"
  type        = string
  default     = ""
}

variable "openai_model" {
  description = "Azure OpenAI model deployment name for captioning"
  type        = string
  default     = "gpt-4o"
}

variable "openai_model_version" {
  type    = string
  default = "2024-11-20"
}

variable "posthog_api_key" {
  description = "PostHog project API key (write-only, safe to be public)"
  type        = string
  default     = "phc_Bjy9d1BMIlblL4Dans0OdI3djqA1CR0M34oBkzAkwGi"
}
