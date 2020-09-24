# Example of creating and running Kind cluster with MetalLB
# https://metallb.universe.tf/concepts/
# so that the cluster has support for service type: LoadBalancer
#
# The benefit of this approach as opposed to the "ingress" approach 
# described in "ingress" folder is that we do not need to explicitly
# set the hostPort value of the pod that needs to be accessed from outside
# the cluster. Hence, the config matches the actual config we are likely
# to use in actual Kubernetes cluster (running in bare metal).
# 
# Assumptions: 
# Kind cluster running via Docker on Linux. The Kind cluster is using Docker 
# "bridge" networking. Tested on Fedora 32 with cgroups-v1.
# https://fedoramagazine.org/docker-and-fedora-32/

kind create cluster

# Install MetalLB: controller (handles IP addr assignment) and 
# speaker (speak the chosen protocol to make the service reachable)
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.9.3/manifests/namespace.yaml
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.9.3/manifests/metallb.yaml

# On first install only
kubectl create secret generic -n metallb-system memberlist --from-literal=secretkey="$(openssl rand -base64 128)"

# Create a configmap to activate MetalLB
#
# Need to specify "address-pools.addresses" where the CIDR range is an unused
# IP addr range in the bridge Docker network used by Kind container.
#
# In my setup, Kind creates a Docker network called "kind" during setup (check with docker network ls).
# We can see the subnet for this network, like so: `docker inspect network kind`
# This example assumes this value: "Subnet": "172.20.0.0/16"
# So we pick some unused IP range like 172.20.200.1-172.20.200.50
#
cat <<EOF | kubectl -n metallb-system apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: metallb-system
  name: config
data:
  config: |
    address-pools:
    - name: default
      protocol: layer2
      addresses:
      - 172.20.200.1-172.20.200.50
EOF

# Test MetalLB by deploying Nginx with service type: LoadBalancer
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:stable
        ports:
        - containerPort: 80
---
kind: Service
apiVersion: v1
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  type: LoadBalancer
  ports:
  - name: http
    protocol: TCP
    port: 80
  selector:
    app: nginx
EOF
