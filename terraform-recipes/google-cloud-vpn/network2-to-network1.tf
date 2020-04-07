resource "google_compute_network" "network2" {
  name                    = "network2"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnetwork2" {
  name          = "subnetwork2"
  ip_cidr_range = "10.148.0.0/20"
  region        = "asia-east1"
  network       = google_compute_network.network2.self_link
}

resource "google_compute_vpn_tunnel" "tunnel2" {
  name = "tunnel2"
  // Replace peer_ip with the computed public IP of the target tunnel
  peer_ip            = var.vpn2_peer
  shared_secret      = "a secret message"
  target_vpn_gateway = google_compute_vpn_gateway.target_gateway2.self_link
  depends_on = [
    google_compute_forwarding_rule.esp2,
    google_compute_forwarding_rule.udp500-2,
    google_compute_forwarding_rule.udp4500-2,
  ]
  local_traffic_selector  = ["10.148.0.0/20"]
  remote_traffic_selector = ["10.140.0.0/20"]
}

resource "google_compute_vpn_gateway" "target_gateway2" {
  name    = "vpn2"
  network = google_compute_network.network2.self_link
}

resource "google_compute_address" "vpn_static_ip2" {
  name = "vpn-static-ip2"
}

resource "google_compute_forwarding_rule" "esp2" {
  name        = "fr-esp2"
  ip_protocol = "ESP"
  ip_address  = google_compute_address.vpn_static_ip2.address
  target      = google_compute_vpn_gateway.target_gateway2.self_link
}

resource "google_compute_forwarding_rule" "udp500-2" {
  name        = "fr-udp500-2"
  ip_protocol = "UDP"
  port_range  = "500"
  ip_address  = google_compute_address.vpn_static_ip2.address
  target      = google_compute_vpn_gateway.target_gateway2.self_link
}

resource "google_compute_forwarding_rule" "udp4500-2" {
  name        = "fr-udp4500-2"
  ip_protocol = "UDP"
  port_range  = "4500"
  ip_address  = google_compute_address.vpn_static_ip2.address
  target      = google_compute_vpn_gateway.target_gateway2.self_link
}

resource "google_compute_route" "route2" {
  name                = "route2"
  network             = google_compute_network.network2.name
  dest_range          = "10.140.0.0/20"
  priority            = 1000
  next_hop_vpn_tunnel = google_compute_vpn_tunnel.tunnel2.self_link
}

resource "google_compute_firewall" "allow_public_ssh2" {
  name    = "allow-public-ssh2"
  network = google_compute_network.network2.name
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow_internal2" {
  name    = "allow-internal2"
  network = google_compute_network.network2.name
  allow {
    protocol = "tcp"
  }
  source_ranges = ["10.0.0.0/8"]
}
