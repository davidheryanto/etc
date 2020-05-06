resource "google_compute_network" "network-2" {
  name                    = "network-2"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnetwork-2" {
  name          = "subnetwork-2"
  ip_cidr_range = "10.148.0.0/20"
  region        = "asia-east1"
  network       = google_compute_network.network-2.self_link
}

resource "google_compute_firewall" "allow-public-ssh-2" {
  name    = "allow-public-ssh-2"
  network = google_compute_network.network-2.name
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow-internal-2" {
  name    = "allow-internal-2"
  network = google_compute_network.network-2.name
  allow {
    protocol = "tcp"
  }
  source_ranges = ["10.0.0.0/8"]
}

// ============================================================
// Tunnel 2 -> 1
// ============================================================

resource "google_compute_vpn_tunnel" "tunnel-2-to-1" {
  name = "tunnel-2-to-1"
  // Replace peer_ip with the computed public IP of the target tunnel
  peer_ip            = var.vpn-2-to-1-peer
  shared_secret      = "a secret message"
  target_vpn_gateway = google_compute_vpn_gateway.gateway-2-to-1.self_link
  depends_on = [
    google_compute_forwarding_rule.esp-2-to-1,
    google_compute_forwarding_rule.udp500-2-to-1,
    google_compute_forwarding_rule.udp4500-2-to-1,
  ]
  local_traffic_selector  = ["10.148.0.0/20"]
  remote_traffic_selector = ["10.140.0.0/20"]
}

resource "google_compute_vpn_gateway" "gateway-2-to-1" {
  name    = "gateway-2-to-1"
  network = google_compute_network.network-2.self_link
}

resource "google_compute_address" "vpn-address-2-to-1" {
  name = "vpn-address-2-to-1"
}

resource "google_compute_forwarding_rule" "esp-2-to-1" {
  name        = "fr-esp-2-to-1"
  ip_protocol = "ESP"
  ip_address  = google_compute_address.vpn-address-2-to-1.address
  target      = google_compute_vpn_gateway.gateway-2-to-1.self_link
}

resource "google_compute_forwarding_rule" "udp500-2-to-1" {
  name        = "fr-udp500-2-to-1"
  ip_protocol = "UDP"
  port_range  = "500"
  ip_address  = google_compute_address.vpn-address-2-to-1.address
  target      = google_compute_vpn_gateway.gateway-2-to-1.self_link
}

resource "google_compute_forwarding_rule" "udp4500-2-to-1" {
  name        = "fr-udp4500-2-to-1"
  ip_protocol = "UDP"
  port_range  = "4500"
  ip_address  = google_compute_address.vpn-address-2-to-1.address
  target      = google_compute_vpn_gateway.gateway-2-to-1.self_link
}

resource "google_compute_route" "route-2-to-1" {
  name                = "route-2-to-1"
  network             = google_compute_network.network-2.name
  dest_range          = "10.140.0.0/20"
  priority            = 1000
  next_hop_vpn_tunnel = google_compute_vpn_tunnel.tunnel-2-to-1.self_link
}

// ============================================================
// Tunnel 2 -> 3
// ============================================================

resource "google_compute_vpn_tunnel" "tunnel-2-to-3" {
  name = "tunnel-2-to-3"
  // Replace peer_ip with the computed public IP of the target tunnel
  peer_ip            = var.vpn-2-to-3-peer
  shared_secret      = "a secret message"
  target_vpn_gateway = google_compute_vpn_gateway.gateway-2-to-3.self_link
  depends_on = [
    google_compute_forwarding_rule.esp-2-to-3,
    google_compute_forwarding_rule.udp-500-2-to-3,
    google_compute_forwarding_rule.udp-4500-2-to-3,
  ]
  local_traffic_selector  = ["10.148.0.0/20", "10.140.0.0/20"]
  remote_traffic_selector = ["10.156.0.0/20"]
}

resource "google_compute_vpn_gateway" "gateway-2-to-3" {
  name    = "gateway-2-to-3"
  network = google_compute_network.network-2.self_link
}

resource "google_compute_address" "vpn-address-2-to-3" {
  name = "vpn-address-2-to-3"
}

resource "google_compute_forwarding_rule" "esp-2-to-3" {
  name        = "fr-esp-2-to-3"
  ip_protocol = "ESP"
  ip_address  = google_compute_address.vpn-address-2-to-3.address
  target      = google_compute_vpn_gateway.gateway-2-to-3.self_link
}

resource "google_compute_forwarding_rule" "udp-500-2-to-3" {
  name        = "fr-udp-500-2-to-3"
  ip_protocol = "UDP"
  port_range  = "500"
  ip_address  = google_compute_address.vpn-address-2-to-3.address
  target      = google_compute_vpn_gateway.gateway-2-to-3.self_link
}

resource "google_compute_forwarding_rule" "udp-4500-2-to-3" {
  name        = "fr-udp-4500-2-to-3"
  ip_protocol = "UDP"
  port_range  = "4500"
  ip_address  = google_compute_address.vpn-address-2-to-3.address
  target      = google_compute_vpn_gateway.gateway-2-to-3.self_link
}

resource "google_compute_route" "route-2-to-3" {
  name                = "route-2-to-3"
  network             = google_compute_network.network-2.name
  dest_range          = "10.156.0.0/20"
  priority            = 1000
  next_hop_vpn_tunnel = google_compute_vpn_tunnel.tunnel-2-to-3.self_link
}
