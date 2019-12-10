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
