# 🚀 Quick Start - Production Deployment

This is a condensed version of the full deployment guide for experienced developers.

## ⚡ **5-Minute Setup**

### **1. Server Preparation**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essentials
sudo apt install -y curl wget git nginx mysql-server

# Install Node.js 24.x
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2
```

### **2. Database Setup**
```bash
# Secure MySQL
sudo mysql_secure_installation

# Create database
sudo mysql -u root -p
CREATE DATABASE story_dapp;
CREATE USER 'story_user'@'localhost' IDENTIFIED BY 'YOUR_PASSWORD';
GRANT ALL PRIVILEGES ON story_dapp.* TO 'story_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### **3. Deploy Application**
```bash
# Clone and setup
sudo git clone <your-repo> /opt/story-dapp
sudo chown -R $USER:$USER /opt/story-dapp
cd /opt/story-dapp

# Install and build
npm install
npm run build

# Run migrations
npm run migrate

# Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### **4. Nginx Configuration**
```bash
# Create config
sudo nano /etc/nginx/sites-available/story-dapp

# Enable site
sudo ln -s /etc/nginx/sites-available/story-dapp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### **5. SSL Certificate**
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 🔧 **Essential Files**

- **`ecosystem.config.js`** - PM2 configuration
- **`deploy.sh`** - Automated deployment script
- **`env.production.template`** - Environment variables template

## 🚀 **Deploy Updates**

```bash
# Set database password
export DB_PASSWORD="your_password"

# Run deployment
./deploy.sh
```

## 📊 **Monitor**

```bash
# View logs
pm2 logs story-dapp-api

# Monitor processes
pm2 monit

# Check status
pm2 status
```

## 🔍 **Health Check**

```bash
curl http://localhost:8080/health
curl https://yourdomain.com/api/dapps/stats?timeframe=24H
```

---

**🎯 Need more details? See the full `DEPLOYMENT.md` guide!**
