provider "google" {
  version = "~> 3.20"
  project = var.project
  region  = var.region
  zone    = var.zone
}

resource "google_compute_network" "network-1" {
  name                    = "network-1"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnetwork-1" {
  name          = "subnetwork-1"
  ip_cidr_range = var.subnet_cidr_range
  region        = "asia-southeast1"
  network       = google_compute_network.network-1.self_link
}

resource "google_compute_firewall" "allow-ssh" {
  name    = "network-1-allow-ssh"
  network = google_compute_network.network-1.self_link
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  target_tags = ["ssh"]
}

resource "google_compute_firewall" "allow-internal" {
  name    = "network-1-allow-internal"
  network = google_compute_network.network-1.self_link
  allow {
    protocol = "tcp"
  }
  allow {
    protocol = "icmp"
  }
  allow {
    protocol = "udp"
  }
  source_ranges = [var.subnet_cidr_range]
}

resource "google_compute_firewall" "allow-vpn-clients" {
  name    = "network-1-allow-vpn-clients"
  network = google_compute_network.network-1.self_link
  allow {
    protocol = "tcp"
  }
  allow {
    protocol = "icmp"
  }
  allow {
    protocol = "udp"
  }
  source_ranges = [var.virtualip_addresspool]
}

resource "google_compute_route" "default-vpn-route" {
  name              = "network-1-route-to-vpn-clients-via-strongswan"
  dest_range        = var.virtualip_addresspool
  network           = google_compute_network.network-1.self_link
  next_hop_instance = google_compute_instance.strongswan.self_link
}

resource "google_compute_firewall" "allow-ipsec" {
  name    = "network-1-allow-ipsec"
  network = google_compute_network.network-1.self_link
  allow {
    protocol = "udp"
    ports    = ["500", "4500"]
  }
  target_tags = ["ipsec"]
}

resource "google_compute_instance" "strongswan" {
  name           = "strongswan"
  machine_type   = "n1-standard-1"
  zone           = "asia-southeast1-a"
  can_ip_forward = true

  tags = ["ipsec", "ssh"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-10"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnetwork-1.self_link
    access_config {
      // access_config block is needed to enable ephemeral public IP
    }
  }

  labels = {
    environment = "test"
    app         = "vpn"
    component   = "strongswan"
  }

  service_account {
    scopes = [
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring.write",
      "https://www.googleapis.com/auth/service.management.readonly",
      "https://www.googleapis.com/auth/servicecontrol",
      "https://www.googleapis.com/auth/trace.append",
    ]
  }

  metadata_startup_script = <<EOF
#!/usr/bin/env bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo '++++++++++++++ Installing strongswan'

apt-get update 
apt-get -y install strongswan-pki libcharon-extra-plugins strongswan strongswan-swanctl iptables-persistent

echo '++++++++++++++ Enabling IP forwarding and setting up iptables config'

echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
/sbin/sysctl -p

echo '++++++++++++++ Generating certificates and swanctl config'

# Generate a CA certificate
pki --gen --type ed25519 --outform pem > strongswanKey.pem
pki --self --ca --lifetime 3652 --in strongswanKey.pem \
           --dn "C=CH, O=strongSwan, CN=strongSwan Root CA" \
           --outform pem > strongswanCert.pem

# Generate a host or user end entity certificate
pki --gen --type ed25519 --outform pem > moonKey.pem
pki --req --type priv --in moonKey.pem \
          --dn "C=CH, O=strongswan, CN=${var.hostname}" \
          --san ${var.hostname} --outform pem > moonReq.pem
pki --issue --cacert strongswanCert.pem --cakey strongswanKey.pem \
            --type pkcs10 --in moonReq.pem --serial 01 --lifetime 1826 \
            --outform pem > moonCert.pem

# Copy certificates to the expected paths
cp strongswanCert.pem /etc/swanctl/x509ca/strongswanCert.pem
cp moonCert.pem /etc/swanctl/x509/moonCert.pem
cp moonKey.pem /etc/swanctl/private/moonKey.pem

cat <<EOF_SWANCTL > /etc/swanctl/swanctl.conf
connections {
    rw {
        pools = rw_pool

        local {
            auth = pubkey
            certs = moonCert.pem
            id = ${var.hostname}
        }
        remote {
            auth = eap-md5
            eap_id = %any
        }
        children {
            net-net {
                local_ts = ${var.subnet_cidr_range}
            }
        }
        send_certreq = no
    }
}

pools {
    rw_pool {
        addrs = ${var.virtualip_addresspool}
    }
}

secrets {
    eap-carol {
        id = carol
        secret = Ar3etTnp
    }
    eap-dave {
        id = dave
        secret = W7R0g3do
    }
}
EOF_SWANCTL

systemctl restart strongswan
systemctl status strongswan
systemctl enable strongswan

swanctl --load-pools
swanctl --load-creds
swanctl --load-conns

echo '++++++++++++++ Setup done!'

EOF
}

# This Nginx server is used to test the VPN connection.
# You should be able to access it via its internal IP address if the VPN
# connection is successful.

resource "google_compute_instance" "nginx" {
  name         = "nginx"
  machine_type = "g1-small"
  zone         = "asia-southeast1-a"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-10"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnetwork-1.self_link
    access_config {
      // access_config block is needed to enable ephemeral public IP
    }
  }

  labels = {
    environment = "test"
    app         = "webserver"
    component   = "nginx"
  }

  service_account {
    scopes = [
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring.write",
      "https://www.googleapis.com/auth/service.management.readonly",
      "https://www.googleapis.com/auth/servicecontrol",
      "https://www.googleapis.com/auth/trace.append",
    ]
  }

  metadata_startup_script = <<EOF
apt-get update
apt-get -y install nginx
systemctl enable nginx
EOF
}
