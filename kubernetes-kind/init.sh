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
