resource "google_compute_network" "network1" {
  name                    = "network1"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnetwork1" {
  name          = "subnetwork1"
  ip_cidr_range = "10.140.0.0/20"
  region        = "asia-east1"
  network       = google_compute_network.network1.self_link
}

resource "google_compute_vpn_tunnel" "tunnel1" {
  name = "tunnel1"
  // Replace peer_ip with the computed public IP of the target tunnel
  peer_ip            = var.vpn1_peer
  shared_secret      = "a secret message"
  target_vpn_gateway = google_compute_vpn_gateway.target_gateway1.self_link
  depends_on = [
    google_compute_forwarding_rule.esp1,
    google_compute_forwarding_rule.udp500-1,
    google_compute_forwarding_rule.udp4500-1,
  ]
  local_traffic_selector  = ["10.140.0.0/20"]
  remote_traffic_selector = ["10.148.0.0/20"]
}

resource "google_compute_vpn_gateway" "target_gateway1" {
  name    = "vpn1"
  network = google_compute_network.network1.self_link
}

resource "google_compute_address" "vpn_static_ip1" {
  name = "vpn-static-ip1"
}

resource "google_compute_forwarding_rule" "esp1" {
  name        = "fr-esp1"
  ip_protocol = "ESP"
  ip_address  = google_compute_address.vpn_static_ip1.address
  target      = google_compute_vpn_gateway.target_gateway1.self_link
}

resource "google_compute_forwarding_rule" "udp500-1" {
  name        = "fr-udp500-1"
  ip_protocol = "UDP"
  port_range  = "500"
  ip_address  = google_compute_address.vpn_static_ip1.address
  target      = google_compute_vpn_gateway.target_gateway1.self_link
}

resource "google_compute_forwarding_rule" "udp4500-1" {
  name        = "fr-udp4500-1"
  ip_protocol = "UDP"
  port_range  = "4500"
  ip_address  = google_compute_address.vpn_static_ip1.address
  target      = google_compute_vpn_gateway.target_gateway1.self_link
}

resource "google_compute_route" "route1" {
  name                = "route1"
  network             = google_compute_network.network1.name
  dest_range          = "10.148.0.0/20"
  priority            = 1000
  next_hop_vpn_tunnel = google_compute_vpn_tunnel.tunnel1.self_link
}

resource "google_compute_firewall" "allow_public_ssh1" {
  name    = "allow-public-ssh1"
  network = google_compute_network.network1.name
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow_internal1" {
  name    = "allow-internal1"
  network = google_compute_network.network1.name
  allow {
    protocol = "tcp"
  }
  source_ranges = ["10.0.0.0/8"]
}
