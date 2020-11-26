./kind-with-registry.sh

# Install Serving component
kubectl apply --filename https://github.com/knative/serving/releases/download/v0.19.0/serving-crds.yaml
kubectl apply --filename https://github.com/knative/serving/releases/download/v0.19.0/serving-core.yaml

# Install Istio for Knative. Make sure "istioctl" is installed.
istioctl install -f istio-minimal-operator.yaml
kubectl apply --filename https://github.com/knative/net-istio/releases/download/v0.19.0/release.yaml
kubectl patch configmap/config-domain \
  --namespace knative-serving \
  --type merge \
  --patch '{"data":{"127.0.0.1.nip.io":""}}'
kubectl patch configmap/config-deployment \
  --namespace knative-serving \
  --type merge \
  --patch  '{"data":{"registriesSkippingTagResolving": "localhost:5000"}}'

# Test the installation
kubectl apply -f foobar.yaml
curl http://bar.default.127.0.0.1.nip.io
curl http://foo.default.127.0.0.1.nip.io
