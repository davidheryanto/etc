variable "gce_ssh_user" {
  type    = "string"
  default = "dheryanto"
}

provider "google" {
  version = "~> 2.5.1"

  # PLEASE PROVIDE VALUES HERE
  project = ""
  region  = ""
  zone    = ""
}

resource "google_compute_instance" "gitlab-runner" {
  name         = "gitlab-runner"
  machine_type = "n1-standard-1"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-9"
      size  = "500"
    }
  }

  network_interface {
    subnetwork = "default"
  }

  metadata {
    ssh-keys = "${var.gce_ssh_user}:${file("~/.ssh/google_compute_engine.pub")}"
  }

  service_account {
    # PLEASE PROVIDE VALUES HERE
    email  = ""
    scopes = ["storage-rw", "logging-write", "monitoring"]
  }

  allow_stopping_for_update = true

  provisioner "remote-exec" {
    connection {
      type        = "ssh"
      user        = "${var.gce_ssh_user}"
      timeout     = "60s"
      private_key = "${file("~/.ssh/google_compute_engine")}"
    }

    inline = [
      <<EOF1
# Install Docker
# ============================================================
curl https://get.docker.com | bash
sudo usermod -aG docker ${var.gce_ssh_user}

# GitLab Runner config
# ============================================================
sudo mkdir -p /srv/gitlab-runner/config
sudo chown ${var.gce_ssh_user} /srv/gitlab-runner/config
cat <<EOF2 > /srv/gitlab-runner/config/config.toml
concurrent = 6
EOF2

# Start GitLab Runner
# ============================================================
sudo docker run -d --name gitlab-runner --restart always \
   -v /srv/gitlab-runner/config:/etc/gitlab-runner \
   -v /var/run/docker.sock:/var/run/docker.sock \
   gitlab/gitlab-runner:latest
EOF1
      ,
    ]
  }
}

/*

Example of how to register new runner
============================================================

docker exec gitlab-runner gitlab-runner register \
--non-interactive \
--url https://gitlab.com/ \
--registration-token PROVIDE_YOUR_TOKEN \
--executor docker \
--description GITLAB_RUNNER \
--docker-image "debian:9" \
--docker-volumes /var/run/docker.sock:/var/run/docker.sock \
--tag-list "TAG1,TAG2"

In order to configure to automatically authenticate to private registry
============================================================

# Assuming the host have auth config at
# /home/dheryanto/.docker/config.json

--docker-volumes /var/run/docker.sock:/var/run/docker.sock \
--docker-volumes /home/dheryanto/.docker/config.json:/root/.docker/config.json \
--env DOCKER_CONFIG=/root/.docker \

*/

