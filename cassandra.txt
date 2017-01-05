# Change cluster name
# http://stackoverflow.com/questions/22006887/cassandra-saved-cluster-name-test-cluster-configured-name
UPDATE system.local SET cluster_name = 'test' where key='local';