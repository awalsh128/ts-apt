#!/bin/bash

# 1. Add the NodeSource repository (installs Node.js 20.x LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 2. Install the modern version (overwrites the old v10)
sudo apt-get install -y nodejs

# 3. Verify (Should show v20.x.x)
node -v