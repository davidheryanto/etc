# Apply this config from a Docker container for isolation
docker run --rm -it -v $PWD:/work -w /work google/cloud-sdk bash

# Install Terraform binary 
apt-get update && apt-get -y install unar
curl -LO https://releases.hashicorp.com/terraform/0.12.24/terraform_0.12.24_linux_amd64.zip
unar terraform_0.12.24_linux_amd64.zip
install terraform /usr/bin/
rm -f terraform terraform_0.12.24_linux_amd64.zip

# Setup Google Cloud application default and SDK authentication
gcloud auth application-default login
gcloud auth login
gcloud config set project <project>
