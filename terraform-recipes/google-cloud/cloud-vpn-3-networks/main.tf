terraform {
  required_version = "~> 0.12.17"
}

provider "google" {
  version = "~> 3.18"
  project = var.project
  region  = "asia-east1"
  zone    = "asia-east1-a"
}

// Compute instances to test the VPN connections b/w different VPC network
// ============================================================

resource "google_compute_instance" "instance-1" {
  name         = "instance-1"
  machine_type = "g1-small"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-10"
    }
  }

  network_interface {
    network    = google_compute_network.network-1.self_link
    subnetwork = google_compute_subnetwork.subnetwork-1.self_link

    access_config {
      // Ephemeral IP
    }
  }
}

resource "google_compute_instance" "instance-2" {
  name         = "instance-2"
  machine_type = "g1-small"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-10"
    }
  }

  network_interface {
    network    = google_compute_network.network-2.self_link
    subnetwork = google_compute_subnetwork.subnetwork-2.self_link

    access_config {
      // Ephemeral IP
    }
  }

  metadata_startup_script = <<EOF
  apt-get -y install nginx
  EOF
}

resource "google_compute_instance" "instance-3" {
  name         = "instance-3"
  machine_type = "g1-small"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-10"
    }
  }

  network_interface {
    network    = google_compute_network.network-3.self_link
    subnetwork = google_compute_subnetwork.subnetwork-3.self_link

    access_config {
      // Ephemeral IP
    }
  }

  metadata_startup_script = <<EOF
  apt-get -y install nginx
  EOF
}
