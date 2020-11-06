# Example of running Spark with Kubernetes as the scheduler.
#
# Kubernetes cluster is created using Kind. Hence, Docker is required. 
# Please install "kind" first from: https://kind.sigs.k8s.io/docs/user/quick-start/
#
# Spark version: 3.0.1

./create-kind-cluster-with-local-docker-registry.sh

# Download Spark release
wget https://downloads.apache.org/spark/spark-3.0.1/spark-3.0.1-bin-hadoop3.2.tgz
tar xvf spark-3.0.1-bin-hadoop3.2.tgz
cd spark-3.0.1-bin-hadoop3.2
export SPARK_HOME=$PWD

# Build Docker image for running PySpark
#
# Note if using Python 3, it may be easier to modify the Dockerfile for 
# PySpark to use Python 3 by default than to modify the runtime Spark context
# and settings.

./bin/docker-image-tool.sh -r localhost:5000/kubernetes-spark -t v1 \
    -p ./kubernetes/dockerfiles/spark/bindings/python/Dockerfile build && \
./bin/docker-image-tool.sh -r localhost:5000/kubernetes-spark -t v1 \
    -p ./kubernetes/dockerfiles/spark/bindings/python/Dockerfile push

# Start JupyterLab and try running sample PySpark job. Example notebook
# is provided in "spark-sample.ipynb"
