# https://github.com/bitnami/bitnami-docker-spark/blob/master/docker-compose.yml
docker pull bitnami/spark:2

# Master
# 
# Web UI at port 8080
# Master URL at port 7070
#
docker run --rm -it --net host \
  -e SPARK_MODE=master \
  -e SPARK_RPC_AUTHENTICATION_ENABLED=no \
  -e SPARK_RPC_ENCRYPTION_ENABLED=no \
  -e SPARK_LOCAL_STORAGE_ENCRYPTION_ENABLED=no \
  -e SPARK_SSL_ENABLED=no \
  bitnami/spark:2

# Worker 
docker run --rm -it --net host \
  -e SPARK_MODE=worker \
  -e SPARK_MASTER_URL=spark://localhost:7077 \
  -e SPARK_WORKER_MEMORY=1G \
  -e SPARK_WORKER_CORES=1 \
  -e SPARK_RPC_AUTHENTICATION_ENABLED=no \
  -e SPARK_RPC_ENCRYPTION_ENABLED=no \
  -e SPARK_LOCAL_STORAGE_ENCRYPTION_ENABLED=no \
  -e SPARK_SSL_ENABLED=no \
  bitnami/spark:2

# Download Spark 2.4.4 release
DOWNLOAD_URL=https://github.com/apache/spark/archive/v2.4.4.tar.gz
wget -O- $DOWNLOAD_URL | tar -C ~/Downloads -xz
sudo mv ~/Downloads/spark-2.4.4 /opt/spark-2.4.4
cat <<EOF >> ~/.bashrc
# Spark 2.4.4
export PATH=\$PATH:/opt/spark-2.4.4/bin
EOF

# Submitting applications
spark-submit \
  --master spark://localhost:7070 \
  --deploy-mode client \
  main.py

# Setup Yarn
DOWNLOAD_URL=https://www-eu.apache.org/dist/hadoop/common/hadoop-2.9.2/hadoop-2.9.2.tar.gz
wget -O- $DOWNLOAD_URL | tar -C ~/Downloads -xz
cd hadoop-rel-release-2.10.0/
