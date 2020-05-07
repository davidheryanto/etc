terraform {
  required_version = "> 0.12.17"
}

provider "google" {
  version = "~> 3.16"
  project = var.project
  region  = "asia-east1"
  zone    = "asia-east1-a"
}

// Compute instances to test the VPN connections b/w different VPC network
// ============================================================

resource "google_compute_instance" "instance1" {
  name         = "instance1"
  machine_type = "g1-small"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-10"
    }
  }

  network_interface {
    network    = google_compute_network.network1.self_link
    subnetwork = google_compute_subnetwork.subnetwork1.self_link

    access_config {
      // Ephemeral IP
    }
  }
}

resource "google_compute_instance" "instance2" {
  name         = "instance2"
  machine_type = "g1-small"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-10"
    }
  }

  network_interface {
    network    = google_compute_network.network2.self_link
    subnetwork = google_compute_subnetwork.subnetwork2.self_link

    access_config {
      // Ephemeral IP
    }
  }

  metadata_startup_script = <<EOF
  apt-get -y install nginx
  EOF
}
