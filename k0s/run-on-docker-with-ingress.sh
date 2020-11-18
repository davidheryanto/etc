# Run with Docker, publishing port 80 to enable ingress
docker run --rm --name k0s-controller --hostname controller \
    --privileged -v /var/lib/k0s -p 6443:6443 -p 80:80 \
    k0sproject/k0s

# Setup kubeconfig
docker exec k0s-controller cat /var/lib/k0s/pki/admin.conf > /tmp/k0s.kubeconfig
chmod 600 /tmp/k0s.kubeconfig
export KUBECONFIG=/tmp/k0s.kubeconfig

# Check cluster
kubectl cluster-info

# Install Nginx ingress controller
kubectl apply -f ingress-controller-nginx.yaml

# Test the ingress controller
kubectl apply -f ingress-demo.yaml

curl localhost/foo # should return foo
curl localhost/bar # should return bar
