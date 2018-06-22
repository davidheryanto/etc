#!/usr/bin/env bash

$(gcloud beta emulators pubsub env-init)

python publisher.py project1 create topic1
python subscriber.py project1 create topic1 subscription1