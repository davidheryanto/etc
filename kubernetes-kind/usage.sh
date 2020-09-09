# Docs: https://kind.sigs.k8s.io/docs

# Install
GO111MODULE="on" go get sigs.k8s.io/kind@v0.8.1

kind create cluster
kind delete cluster

# Create cluster with Ingress
kind create cluster --config cluster-with-ingress.yaml

# Alternatively,
cat <<EOF | kind create cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
EOF

# Install Ingress Nginx
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/static/provider/kind/deploy.yaml

# Test using the Ingress
kubectl apply -f ingress-usage-example.yaml 

curl localhost/foo
curl localhost/bar
