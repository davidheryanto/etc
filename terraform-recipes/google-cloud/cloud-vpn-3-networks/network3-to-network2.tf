resource "google_compute_network" "network-3" {
  name                    = "network-3"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnetwork-3" {
  name          = "subnetwork-3"
  ip_cidr_range = "10.156.0.0/20"
  region        = "asia-east1"
  network       = google_compute_network.network-3.self_link
}

resource "google_compute_firewall" "allow-public-ssh-3" {
  name    = "allow-public-ssh-3"
  network = google_compute_network.network-3.name
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow-internal-3" {
  name    = "allow-internal-3"
  network = google_compute_network.network-3.name
  allow {
    protocol = "tcp"
  }
  source_ranges = ["10.0.0.0/8"]
}

# ============================================================
# Tunnel 3 -> 2
# ============================================================

resource "google_compute_vpn_tunnel" "tunnel-3-to-2" {
  name = "tunnel-3-to-2"
  # Replace peer_ip with the computed public IP of the target tunnel
  peer_ip            = var.vpn-3-to-2-peer
  shared_secret      = "a secret message"
  target_vpn_gateway = google_compute_vpn_gateway.gateway-3-to-2.self_link
  depends_on = [
    google_compute_forwarding_rule.esp-3-to-2,
    google_compute_forwarding_rule.udp-500-3-to-2,
    google_compute_forwarding_rule.udp-4500-3-to-2,
  ]
  local_traffic_selector  = ["10.156.0.0/20"]
  remote_traffic_selector = ["10.148.0.0/20"]

  ## The following allows packets from network 1->2->3
  # remote_traffic_selector = ["10.148.0.0/20", "10.140.0.0/20"]
}

resource "google_compute_vpn_gateway" "gateway-3-to-2" {
  name    = "gateway-3-to-2"
  network = google_compute_network.network-3.self_link
}

resource "google_compute_address" "vpn-address-3-to-2" {
  name = "vpn-address-3-to-2"
}

resource "google_compute_forwarding_rule" "esp-3-to-2" {
  name        = "fr-esp-3-to-2"
  ip_protocol = "ESP"
  ip_address  = google_compute_address.vpn-address-3-to-2.address
  target      = google_compute_vpn_gateway.gateway-3-to-2.self_link
}

resource "google_compute_forwarding_rule" "udp-500-3-to-2" {
  name        = "fr-udp-500-3-to-2"
  ip_protocol = "UDP"
  port_range  = "500"
  ip_address  = google_compute_address.vpn-address-3-to-2.address
  target      = google_compute_vpn_gateway.gateway-3-to-2.self_link
}

resource "google_compute_forwarding_rule" "udp-4500-3-to-2" {
  name        = "fr-udp-4500-3-to-2"
  ip_protocol = "UDP"
  port_range  = "4500"
  ip_address  = google_compute_address.vpn-address-3-to-2.address
  target      = google_compute_vpn_gateway.gateway-3-to-2.self_link
}

resource "google_compute_route" "route-3-to-2" {
  name                = "route-3-to-2"
  network             = google_compute_network.network-3.name
  dest_range          = "10.148.0.0/20"
  priority            = 1000
  next_hop_vpn_tunnel = google_compute_vpn_tunnel.tunnel-3-to-2.self_link
}

## The following allows packets from network 1->2->3
# resource "google_compute_route" "route-3-to-1-via-2" {
#   name                = "route-3-to-1-via-2"
#   network             = google_compute_network.network-3.name
#   dest_range          = "10.140.0.0/20"
#   priority            = 1000
#   next_hop_vpn_tunnel = google_compute_vpn_tunnel.tunnel-3-to-2.self_link
# }
