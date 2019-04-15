# With RBAC enabled, make sure you have cluster admin role
kubectl create clusterrolebinding my-cluster-admin-binding --clusterrole=cluster-admin --user=$(gcloud info --format="value(config.account)")

# With RBAC enabled, install Ambassador
kubectl apply -f https://getambassador.io/yaml/ambassador/ambassador-rbac.yaml

# Install Ambassador service
kubectl apply -f ambassador-service.yaml

# Creating routes
kubectl apply -f httpbin.yaml

# Then, you can visit the site
http://[LOAD_BALANCER_IP]/httpbin/

# Diagnostics
kubectl port-forward [AMBASSADOR_POD] 8877