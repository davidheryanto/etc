### Strongswan IPSec Client

By default, it uses `charon-cmd` command to establish connection to IPSec server. It also includes Let's Encrypt public certificates (saved in / directory) for easier use with IPSec servers using Let's Encrypt certificates.

Refer to this URL to retrieve the root and intermedita certificates from Let's Encrypt:
- https://letsencrypt.org/certificates/
- https://letsencrypt.org/certs/letsencryptauthorityx3.pem.txt
- https://letsencrypt.org/certs/isrgrootx1.pem.txt

NOTE:  
Requires running Docker command with `--net=host --cap-add=NET_ADMIN` options so the container can modify host network settings.

Example usage (replace USER and REMOTE_VPN_HOST accordingly):
```
docker run --rm -it --net host --cap-add=NET_ADMIN davidheryanto/strongswan \
  --cert isrgrootx1.pem.txt --cert letsencryptauthorityx3.pem.txt \
  --cert lets-encrypt-r3.pem.txt \
  --ike-proposal aes256-sha1-modp1024 \
  --identity USER --host REMOTE_VPN_HOST
```

For convenience, it is useful to set an alias for running this image
```
echo "alias charon-cmd='docker run --rm -it --net=host --cap-add=NET_ADMIN davidheryanto/strongswan' " >> ~/.bashrc
```

Exit and re-open your terminal session, then you can use it like so:
```
charon-cmd --cert isrgrootx1.pem.txt --cert letsencryptauthorityx3.pem.txt \
  --cert lets-encrypt-r3.pem.txt \
  --ike-proposal aes256-sha1-modp1024 \
  --identity USER --host REMOTE_VPN_HOST
```