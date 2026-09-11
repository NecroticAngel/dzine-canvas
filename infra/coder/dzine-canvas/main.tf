terraform {
  required_providers {
    coder = {
      source = "coder/coder"
    }
    kubernetes = {
      source = "hashicorp/kubernetes"
    }
  }
}

provider "coder" {}
provider "kubernetes" {}

module "workspace" {
  source = "./_module"

  cpu_default        = "4"
  memory_default     = "8"
  default_repo       = "git@github.com:NecroticAngel/dzine-canvas.git"
  repo_description   = "Git repository URL to clone (SSH or HTTPS)"
  image              = "ghcr.io/haakco/coder-workspace-playwright:latest"
  bootstrap_commands = ["npm ci"]
  dev_apps = {
    editor = { display_name = "Dzine Editor", port = 4200 }
    api    = { display_name = "Templates API", port = 4201 }
  }
  symlink_path              = "/home/coder/Dev/Jo/dzine-canvas"
  rewrite_https_repo_to_ssh = true
}
