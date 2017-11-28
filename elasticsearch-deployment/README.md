### Elasticsearch Deployment

Listing of steps and configuration for Elasticsearch deployment on Google Cloud

#### Notes
- Update `/etc/elasticsearch/elasticsearch.yml` (refer to the elasticsearch.yml in the repo)
- Update `/etc/elasticsearch/jvm.options`
  - to use ~50% of total RAM
  - to logrotate GC log
- Update `/usr/lib/systemd/system/elasticsearch.service`
  - [Service]  
    ...  
    LimitMEMLOCK=infinity
- If creating snapshots, remember to remove data dir (which save the elasticsearch node id, when using the snapshot we want different nodes to have different node ids)  
  `rm -rf /var/lib/elasticsearch/nodes`
- In the end, enable elasticsearch on reboot  
  `systemctl daemon-reload && systemctl enable elasticsearch`
- Update X-Pack license
  ```
  http PUT $ES_HOST:9200/_xpack/license < license.json
  http PUT $ES_HOST:9200/_xpack/license?acknowledge=true < license.json
  ```

#### References:
1. Changing elasticsearch index template (e.g. when used by Logstash)  
   http://spuder.github.io/2015/elasticsearch-default-shards/
