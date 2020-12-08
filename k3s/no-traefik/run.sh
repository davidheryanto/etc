#!/usr/bin/env bash

docker-compose down -v && docker-compose up -d

echo ""
echo "Run the following to configure kubectl to access the cluster:"
echo "export KUBECONFIG=$PWD/kubeconfig"
