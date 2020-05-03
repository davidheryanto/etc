# Reference:
# https://github.com/strongswan/strongswan
#
# Roadwarrior Case with EAP Identity
# 10.1.0.0/16 -- | 192.168.0.1 | === | x.x.x.x | -- 10.3.0.1
#   moon-net          moon              carol       virtual IP
#

docker run --rm -it --net host --cap-add=NET_ADMIN alpine:3.9 sh
apk add strongswan

# Generating a CA Certificate
pki --gen --type ed25519 --outform pem > strongswanKey.pem
pki --self --ca --lifetime 3652 --in strongswanKey.pem \
           --dn "C=CH, O=strongSwan, CN=strongSwan Root CA" \
           --outform pem > strongswanCert.pem

# Generating a Host or User End Entity Certificate
pki --gen --type ed25519 --outform pem > moonKey.pem
pki --req --type priv --in moonKey.pem \
          --dn "C=CH, O=strongswan, CN=moon.strongswan.org" \
          --san moon.strongswan.org --outform pem > moonReq.pem
pki --issue --cacert strongswanCert.pem --cakey strongswanKey.pem \
            --type pkcs10 --in moonReq.pem --serial 01 --lifetime 1826 \
            --outform pem > moonCert.pem

# Copy certificates to expected paths
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
                local_ts  = 10.1.0.0/16
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

# Start charon daemon
/usr/lib/strongswan/charon &> /var/log/charon.log &

swanctl --load-creds
swanctl --load-conns


# Client
docker run --rm -it --net host --cap-add=NET_ADMIN --name client alpine:3.9 sh

charon-cmd --cert isrgrootx1.pem.txt --cert letsencryptauthorityx3.pem.txt \
    --ike-proposal aes256-sha1-modp1024 \
    --identity dheryanto --host xxx
docker cp /tmp/strongswanCert.pem client:/

charon-cmd --cert /strongswanCert.pem \
    --identity carol --host moon.strongswan.org