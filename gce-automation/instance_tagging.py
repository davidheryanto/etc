import googleapiclient.discovery

"""
Automate the tagging of GCE instances based on instance name prefix

References:
https://cloud.google.com/compute/docs/reference/latest/
"""

project = 'YOUR_GCP_PROJECT'
zones = ['asia-east1-a', 'asia-east1-b', 'asia-east1-c']
instance_name_prefix = 'delete-me-'
tags_to_add = 'no-ip'

service = googleapiclient.discovery.build('compute', 'v1')

for zone in zones:
    req = service.instances().list(project=project, zone=zone)
    res = req.execute()

    for instance in res['items']:
        if instance['name'].startswith(instance_name_prefix):
            # For debugging
            # ============================================================
            # import json
            # print(json.dumps(instance, indent=2))

            # Update the tags
            # ============================================================
            print(f'Updating tags for {instance["name"]}')
            tags_body = instance['tags']
            if 'items' in tags_body and tags_to_add in tags_body['items']:
                tags_body['items'].remove(tags_to_add)
            if 'items' not in tags_body:
                tags_body['items'] = []
            tags_body['items'].append(tags_to_add)

            print(tags_body)
            tags_req = service.instances().setTags(project=project, zone=zone, instance=instance['name'],
                                                   body=tags_body)
            tags_req.execute()
