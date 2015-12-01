vagrant init

vagrant box add hashicorp/precise32

vagrant up
vagrant ssh
vagrant destroy

# Synced folders
vagrant up
vagrant ssh
ls /vagrant

Install apache
-----------------------------
bootstrap.sh
============
#!/usr/bin/env bash

apt-get update
apt-get install -y apache2
if ! [ -L /var/www ]; then
  rm -rf /var/www
  ln -fs /vagrant /var/www
fi

Vagrantfile
===========
Vagrant.configure("2") do |config|
  config.vm.box = "hashicorp/precise32"
  config.vm.provision :shell, path: "bootstrap.sh"
end
-----------------------------

Provision if already running
vagrant reload --provision

# Port forwarding
Vagrant.configure("2") do |config|
  config.vm.box = "hashicorp/precise32"
  config.vm.provision :shell, path: "bootstrap.sh"
  config.vm.network :forwarded_port, guest: 80, host: 4567
end
vagrant reload (if running) OR vagrant up
browser: http://127.0.0.1:4567

# Teardown
vagrant suspend
vagrant halt
vagrant destory

# Providers
vagrant up --provider=vmware_fusion
vagrant up --provider=aws

# Boxes
vagrant box
vagrant box add hashicorp/precise64
vagrant init hashicorp/precise64

vagrant box add my-box /path/to/new.box
vagrant init my-box
vagrant up

