resource "google_compute_instance" "default" {
  name         = "deleteme"
  machine_type = "f1-micro"

  tags = ["test"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-9"
    }
  }

  network_interface {
    subnetwork = "${var.subnetwork}"
  }

  service_account {
    scopes = ["cloud-platform"]
  }

  provisioner "remote-exec" {
    scripts = [
    "scripts/init.sh",
    ]

    connection {
      type = "ssh"
      user = "${var.user}"
      # Password is not used, private_key is used instead
      # But still need to be provided, else Terraform will ignore the user, private_key values
      password = ""
      private_key = "${file("${var.private_key_file}")}"
    }
  }
}