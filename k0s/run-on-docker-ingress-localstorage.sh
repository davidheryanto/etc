# Run with Docker, publishing port 80 to enable ingress
docker run --rm --name k0s-controller --hostname controller \
    --privileged -v /var/lib/k0s -p 6443:6443 -p 80:80 \
    k0sproject/k0s

# Setup kubeconfig
docker exec k0s-controller cat /var/lib/k0s/pki/admin.conf > /tmp/k0s.kubeconfig
chmod 600 /tmp/k0s.kubeconfig
export KUBECONFIG=/tmp/k0s.kubeconfig

# Check cluster make sure Kubernetes master, CoreDNS are both running
kubectl cluster-info
kubectl -n kube-system wait pod --all --for=condition=Ready --timeout=2m

# Install Nginx ingress controller
kubectl apply -f ingress-controller-nginx.yaml
kubectl -n ingress-nginx wait pod \
    --selector=app.kubernetes.io/component=controller \
    --for=condition=Ready --timeout=2m

# Test the ingress controller
kubectl apply -f ingress-demo.yaml
kubectl wait pod --all --for=condition=Ready --timeout=2m

curl localhost/foo # should return foo
curl localhost/bar # should return bar

# Install local path provisioner so we can use PVC
# https://github.com/rancher/local-path-provisioner
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml
kubectl -n local-path-storage wait pod --all --for=condition=Ready --timeout=1m

# To make this local-path storage class the default
kubectl annotate storageclass local-path \
    storageclass.kubernetes.io/is-default-class="true"

# Test the pvc
kubectl apply -f pvc-demo.yaml
