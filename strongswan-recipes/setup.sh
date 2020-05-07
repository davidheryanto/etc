# Reference:
# https://github.com/strongswan/strongswan
#
# Roadwarrior Case with EAP Identity
# 10.1.0.0/16 -- | 192.168.0.1 | === | x.x.x.x | -- 10.3.0.1
#   moon-net          moon              carol       virtual IP

# On Debian 10
# ============================================================
# apt-get -y install strongswan-pki libcharon-extra-plugins strongswan strongswan-swanctl iptables-persistent
# systemctl start strongswan
# systemctl status strongswan

# Install docker
curl https://get.docker.com | bash
sudo usermod -aG docker $USER

# Enable IP forwarding 
sudo sysctl -w net.ipv4.ip_forward=1

# Setup masquerade for packets coming from the Virtual IP subnet
sudo iptables -t nat -A POSTROUTING -s 10.3.0.0/16 -j MASQUERADE

# https://docs.docker.com/network/iptables/#docker-on-a-router
sudo iptables -I DOCKER-USER -j ACCEPT

docker run --rm -it --name strongswan \
    --net host --cap-add NET_ADMIN alpine:3.9 sh

# Once inside the Docker shell
# ============================================================

apk add strongswan curl

# Generate a CA certificate
pki --gen --type ed25519 --outform pem > strongswanKey.pem
pki --self --ca --lifetime 3652 --in strongswanKey.pem \
           --dn "C=CH, O=strongSwan, CN=strongSwan Root CA" \
           --outform pem > strongswanCert.pem

# Generate a host or user end entity certificate
pki --gen --type ed25519 --outform pem > moonKey.pem
pki --req --type priv --in moonKey.pem \
          --dn "C=CH, O=strongswan, CN=moon.strongswan.org" \
          --san moon.strongswan.org --outform pem > moonReq.pem
pki --issue --cacert strongswanCert.pem --cakey strongswanKey.pem \
            --type pkcs10 --in moonReq.pem --serial 01 --lifetime 1826 \
            --outform pem > moonCert.pem

# Copy certificates to the expected paths
cp strongswanCert.pem /etc/swanctl/x509ca/strongswanCert.pem
cp moonCert.pem /etc/swanctl/x509/moonCert.pem
cp moonKey.pem /etc/swanctl/private/moonKey.pem

cat <<EOF > /etc/swanctl/swanctl.conf

connections {
    rw {
        pools = rw_pool

        local {
            auth = pubkey
            certs = moonCert.pem
            id = moon.strongswan.org
        }
        remote {
            auth = eap-md5
            eap_id = %any
        }
        children {
            net-net {
                local_ts = 10.140.0.0/20
            }
        }
        send_certreq = no
    }
}

pools {
    rw_pool {
        addrs = 10.3.0.0/16
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

EOF

/usr/lib/strongswan/charon &> /var/log/charon.log &

swanctl --load-pools
swanctl --load-creds
swanctl --load-conns

curl -F "file=@/strongswanCert.pem" https://file.io

# Client
# ============================================================
# First download strongswanCert.pem to /tmp/strongswanCert.pem
# wget -O /tmp/strongswanCert.pem https://file.io/xxx1234

docker run --rm -it --net host -v /tmp/strongswanCert.pem:/tmp/strongswanCert.pem \
    -w /tmp --cap-add=NET_ADMIN alpine:3 sh

apk add strongswan
charon-cmd --cert /tmp/strongswanCert.pem --identity carol --host moon.strongswan.org
