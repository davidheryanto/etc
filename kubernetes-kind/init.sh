# Docs: https://kind.sigs.k8s.io/docs

# Install kind CLI
GO111MODULE="on" go get sigs.k8s.io/kind@v0.8.1

kind create cluster
kind create cluster --wait 90s
kind delete cluster

kind create cluster --name kind-2
kind delete cluster --name kind-2

kind get clusters

kubectl cluster-info --context kind-kind
kubectl cluster-info --context kind-kind-2

kind get nodes
kind get nodes --name $KIND_CLUSTER_NAME

# Multi node Kind cluster
cat <<EOF | kind create cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: worker
- role: worker
EOF

# Install metrics server: https://github.com/kubernetes-sigs/kind/issues/398
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.3.6/components.yaml
kubectl patch deployment metrics-server -n kube-system -p '{"spec":{"template":{"spec":{"containers":[{"name":"metrics-server","args":["--cert-dir=/tmp", "--secure-port=4443", "--kubelet-insecure-tls","--kubelet-preferred-address-types=InternalIP"]}]}}}}'
