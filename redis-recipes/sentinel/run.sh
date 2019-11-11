# Delete all containers
docker container stop $(docker container ls -aq)

# Start Master
NAME=master
docker run --rm -it --name $NAME -v $PWD:/etc/redis \
  --net host --detach \
  redis:5 \
  redis-server --port 6379

# Start Replica
NAME=replica
docker run --rm -it --name $NAME -v $PWD:/etc/redis \
--net host --detach \
  redis:5 \
  redis-server /etc/redis/replica.conf --port 6380

# Start Sentinel
for i in 1 2 3; do
  container=sentinel-$i
  port=$((4999+$i))

  docker rm -f $container &> /dev/null
  
  docker run --rm -it --name $container -v $PWD:/etc/redis \
    --net host --detach \
    redis:5 \
    redis-server /etc/redis/sentinel-$i.conf --sentinel --port $port
done

# Get current master
redis-cli -p 5000 SENTINEL get-master-addr-by-name mymaster

# Test failover: Make master unreachable for 30 seconds
redis-cli -p 6379 DEBUG sleep 30