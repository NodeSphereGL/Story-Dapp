# 🚀 Production Deployment Guide - Ubuntu 24.04

This guide covers deploying the Story Protocol dApp Statistics Service to production on Ubuntu 24.04.

## 📋 **Prerequisites**

- Ubuntu 24.04 LTS server
- Root or sudo access
- Domain name (optional but recommended)
- SSL certificate (Let's Encrypt recommended)

## 🛠️ **System Setup**

### **1. Update System**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip software-properties-common
```

### **2. Install Node.js 24.x**
```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v24.x.x
npm --version
```

### **3. Install MySQL 8.0**
```bash
# Add MySQL repository
wget https://dev.mysql.com/get/mysql-apt-config_0.8.29-1_all.deb
sudo dpkg -i mysql-apt-config_0.8.29-1_all.deb
sudo apt update

# Install MySQL
sudo apt install -y mysql-server

# Secure MySQL installation
sudo mysql_secure_installation
```

### **4. Install Nginx**
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### **5. Install PM2 (Process Manager)**
```bash
sudo npm install -g pm2
```

## 🗄️ **Database Setup**

### **1. Create Database and User**
```bash
sudo mysql -u root -p

# In MySQL prompt:
CREATE DATABASE story_dapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'story_user'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON story_dapp.* TO 'story_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### **2. Run Database Migrations**
```bash
# Clone your repository
git clone <your-repo-url> /opt/story-dapp
cd /opt/story-dapp

# Install dependencies
npm install

# Build the project
npm run build

# Run migrations
npm run migrate

# Seed initial data (if needed)
npm run seed
```

## ⚙️ **Application Configuration**

### **1. Environment Variables**
```bash
sudo nano /opt/story-dapp/.env
```

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=story_dapp
DB_USER=story_user
DB_PASSWORD=YOUR_STRONG_PASSWORD

# API Configuration
API_PORT=8080
NODE_ENV=production
STORYSCAN_API_URL=https://api.storyscan.xyz
STORYSCAN_API_KEY=YOUR_API_KEY

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/story-dapp/app.log

# Security
JWT_SECRET=YOUR_SUPER_SECRET_JWT_KEY
CORS_ORIGIN=https://yourdomain.com
```

### **2. Create Log Directory**
```bash
sudo mkdir -p /var/log/story-dapp
sudo chown -R $USER:$USER /var/log/story-dapp
```

## 🔧 **PM2 Configuration**

### **1. Create PM2 Ecosystem File**
```bash
sudo nano /opt/story-dapp/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'story-dapp-api',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    log_file: '/var/log/story-dapp/combined.log',
    out_file: '/var/log/story-dapp/out.log',
    error_file: '/var/log/story-dapp/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

### **2. Start Application with PM2**
```bash
cd /opt/story-dapp
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

## 🌐 **Nginx Configuration**

### **1. Create Nginx Site Configuration**
```bash
sudo nano /etc/nginx/sites-available/story-dapp
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # API Proxy
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Health Check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    
    # Static Files (if any)
    location / {
        root /var/www/html;
        try_files $uri $uri/ =404;
    }
}
```

### **2. Enable Site and Test Configuration**
```bash
sudo ln -s /etc/nginx/sites-available/story-dapp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🔒 **SSL Certificate (Let's Encrypt)**

### **1. Install Certbot**
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### **2. Obtain SSL Certificate**
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### **3. Auto-renewal Setup**
```bash
sudo crontab -e

# Add this line:
0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 **Monitoring and Logging**

### **1. PM2 Monitoring**
```bash
# View logs
pm2 logs story-dapp-api

# Monitor processes
pm2 monit

# View status
pm2 status
```

### **2. System Monitoring**
```bash
# Install monitoring tools
sudo apt install -y htop iotop nethogs

# Monitor system resources
htop
```

### **3. Log Rotation**
```bash
sudo nano /etc/logrotate.d/story-dapp
```

```
/var/log/story-dapp/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
```

## 🚀 **Deployment Scripts**

### **1. Create Deployment Script**
```bash
sudo nano /opt/story-dapp/deploy.sh
```

```bash
#!/bin/bash

echo "🚀 Starting deployment..."

# Navigate to project directory
cd /opt/story-dapp

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build project
echo "🔨 Building project..."
npm run build

# Run migrations (if any)
echo "🗄️ Running database migrations..."
npm run migrate

# Restart PM2 processes
echo "🔄 Restarting application..."
pm2 reload story-dapp-api

# Check status
echo "✅ Deployment completed!"
pm2 status
```

### **2. Make Script Executable**
```bash
chmod +x /opt/story-dapp/deploy.sh
```

## 🔄 **Automated Deployment with GitHub Actions**

### **1. Create GitHub Actions Workflow**
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Deploy to server
      uses: appleboy/ssh-action@v0.1.5
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.SSH_KEY }}
        script: |
          cd /opt/story-dapp
          ./deploy.sh
```

## 📈 **Performance Optimization**

### **1. MySQL Optimization**
```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

```ini
[mysqld]
# InnoDB Settings
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT

# Connection Settings
max_connections = 200
max_connect_errors = 1000000

# Query Cache
query_cache_type = 1
query_cache_size = 64M
query_cache_limit = 2M
```

### **2. Nginx Optimization**
```bash
sudo nano /etc/nginx/nginx.conf
```

```nginx
# In http block
worker_processes auto;
worker_connections 1024;
keepalive_timeout 65;
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
```

## 🚨 **Security Hardening**

### **1. Firewall Setup**
```bash
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw status
```

### **2. Fail2ban Installation**
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### **3. Regular Security Updates**
```bash
sudo crontab -e

# Add this line for automatic security updates:
0 2 * * * /usr/bin/apt-get update && /usr/bin/apt-get upgrade -y
```

## 📋 **Maintenance Tasks**

### **1. Database Backup Script**
```bash
sudo nano /opt/story-dapp/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="story_dapp"

mkdir -p $BACKUP_DIR

# Database backup
mysqldump -u story_user -p$DB_PASSWORD $DB_NAME > $BACKUP_DIR/${DB_NAME}_${DATE}.sql

# Compress backup
gzip $BACKUP_DIR/${DB_NAME}_${DATE}.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: ${DB_NAME}_${DATE}.sql.gz"
```

### **2. Log Cleanup**
```bash
sudo nano /opt/story-dapp/cleanup.sh
```

```bash
#!/bin/bash
# Clean old logs
find /var/log/story-dapp -name "*.log" -mtime +30 -delete

# Clean PM2 logs
pm2 flush

echo "Cleanup completed"
```

## 🔍 **Troubleshooting**

### **1. Common Issues**

**Application won't start:**
```bash
pm2 logs story-dapp-api
pm2 status
```

**Database connection issues:**
```bash
sudo systemctl status mysql
sudo mysql -u story_user -p story_dapp
```

**Nginx issues:**
```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### **2. Health Check Endpoints**
```bash
# Application health
curl http://localhost:8080/health

# Database health
mysql -u story_user -p -e "SELECT 1"
```

## 📚 **Useful Commands**

```bash
# View application logs
pm2 logs story-dapp-api --lines 100

# Restart application
pm2 restart story-dapp-api

# View system resources
htop
df -h
free -h

# Check MySQL status
sudo systemctl status mysql

# Check Nginx status
sudo systemctl status nginx

# View recent system logs
sudo journalctl -f
```

## 🎯 **Next Steps**

1. **Set up monitoring** with tools like Prometheus + Grafana
2. **Implement CI/CD** pipeline with GitHub Actions
3. **Add alerting** for critical issues
4. **Set up automated backups** to cloud storage
5. **Implement rate limiting** and DDoS protection
6. **Add health checks** and uptime monitoring

---

**🎉 Your Story Protocol dApp Statistics Service is now production-ready!**

For support or questions, refer to the project documentation or create an issue in the repository.
