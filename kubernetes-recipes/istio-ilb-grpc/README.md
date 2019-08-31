Reference:
https://cloud.google.com/solutions/using-istio-for-internal-load-balancing-of-grpc-services

```bash
git clone https://github.com/GoogleCloudPlatform/istio-samples.git
cd istio-samples/sample-apps/grpc-greeter-go
```

Installing Istio with ILB Gateway
```
./linux-amd64/helm template \
    istio-$ISTIO_VERSION/install/kubernetes/helm/istio \
    --set gateways.istio-ingressgateway.enabled=false \
    --set gateways.istio-ilbgateway.enabled=true \
    --set gateways.istio-ilbgateway.ports[0].name=grpc \
    --set gateways.istio-ilbgateway.ports[0].port=443 \
    --set global.hub=gcr.io/gke-release/istio \
    --set global.tag=$ISTIO_PACKAGE \
    --set prometheus.hub=gcr.io/gke-release/istio/prom \
    --name istio \
    --namespace istio-system | kubectl apply -f -
```
