apt-get -qq update \
&& apt-get -y -qq install lsb-release sudo gnupg2 curl vim \
&& export CLOUD_SDK_REPO="cloud-sdk-$(lsb_release -c -s)" \
&& echo "deb http://packages.cloud.google.com/apt $CLOUD_SDK_REPO main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
&& curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add - \
&& apt-get -qq update && sudo apt-get -y -qq install google-cloud-sdk \
&& export GCSFUSE_REPO=gcsfuse-`lsb_release -c -s` \
&& echo "deb http://packages.cloud.google.com/apt $GCSFUSE_REPO main" | sudo tee /etc/apt/sources.list.d/gcsfuse.list \
&& curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add - \
&& sudo apt-get -qq update \
&& sudo apt-get -y -qq install gcsfuse


cat <<EOF >> ~/.vimrc
set tabstop=4
set shiftwidth=4
set autoindent
:syntax enable
set pastetoggle=<F12>
:color desert
EOF

GCS_DIR=mydir
GCS_BUCKET=mybucket
GCS_MOUNT_PATH=/tmp/mount/gcs

mkdir -p $GCS_MOUNT_PATH
gcsfuse --only-dir $GCS_DIR $GCS_BUCKET $GCS_MOUNT_PATH

# To use specific service account 
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
gcsfuse --only-dir $GCS_DIR $GCS_BUCKET $GCS_MOUNT_PATH