#!/bin/bash

# 🚀 Story Protocol dApp Statistics Service - Deployment Script
# This script automates the deployment process for production

set -e  # Exit on any error

echo "🚀 Starting Story Protocol dApp deployment..."

# Configuration
PROJECT_DIR="/opt/story-dapp"
BACKUP_DIR="/opt/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root"
   exit 1
fi

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    print_error "Project directory $PROJECT_DIR does not exist"
    exit 1
fi

# Navigate to project directory
cd "$PROJECT_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

print_status "Creating database backup..."
# Database backup (you'll need to set DB_PASSWORD in environment)
if [ -n "$DB_PASSWORD" ]; then
    mysqldump -u story_user -p"$DB_PASSWORD" story_dapp > "$BACKUP_DIR/story_dapp_${TIMESTAMP}.sql"
    gzip "$BACKUP_DIR/story_dapp_${TIMESTAMP}.sql"
    print_success "Database backup created: story_dapp_${TIMESTAMP}.sql.gz"
else
    print_warning "DB_PASSWORD not set, skipping database backup"
fi

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

print_status "Pulling latest changes from git..."
git pull origin main

print_status "Installing dependencies..."
npm ci --production

print_status "Building project..."
npm run build

print_status "Running database migrations..."
npm run migrate

print_status "Restarting application with PM2..."
pm2 reload story-dapp-api

# Wait a moment for the app to start
sleep 5

# Check if the application is running
if pm2 list | grep -q "story-dapp-api.*online"; then
    print_success "Application is running successfully!"
else
    print_error "Application failed to start. Check PM2 logs:"
    pm2 logs story-dapp-api --lines 20
    exit 1
fi

print_status "Checking application health..."
# Wait for the app to be ready
sleep 10

# Health check
if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    print_success "Health check passed!"
else
    print_warning "Health check failed, but application is running"
fi

print_status "Deployment completed successfully!"
echo ""
echo "📊 Deployment Summary:"
echo "   - Project: Story Protocol dApp Statistics Service"
echo "   - Environment: Production"
echo "   - Timestamp: $TIMESTAMP"
echo "   - Status: ✅ Running"
echo ""
echo "🔍 Useful commands:"
echo "   - View logs: pm2 logs story-dapp-api"
echo "   - Monitor: pm2 monit"
echo "   - Status: pm2 status"
echo "   - Restart: pm2 restart story-dapp-api"
echo ""

pm2 status story-dapp-api
