# Story Protocol dApp Stats Service

A comprehensive analytics service for tracking Story Protocol dApp statistics, including transaction counts and unique user metrics with time-based analytics.

## 🚀 Features

- **Real-time Data Ingestion**: Automated crawling of blockchain data from Storyscan
- **Multi-timeframe Analytics**: 24H, 7D, and 30D statistics with change tracking
- **Exact Unique Users**: Precise user counting per hour using lightweight approach
- **Sparkline Visualization**: Hourly transaction trends for quick insights
- **RESTful API**: Clean API endpoints for integrating with dashboards and applications
- **Rate Limiting**: Built-in protection against API abuse
- **Scheduled Ingestion**: Automated data collection every 5 minutes (configurable)

## 🏗️ Architecture

The service is built with a modular architecture:

- **Database Layer**: MySQL 8 with optimized schemas for time-series data
- **API Layer**: Express.js server with validation and rate limiting
- **Ingestion Layer**: Automated crawlers with Storyscan API integration
- **Scheduling Layer**: Cron-based job orchestration
- **Utility Layer**: Time calculations, formatting, and data processing

## 📋 Prerequisites

- Node.js 18+ 
- MySQL 8.0+
- Access to Storyscan API (public)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd story_dapp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Database Configuration
   MYSQL_URL=mysql://user:pass@localhost:3306/story_stats?timezone=Z
   
   # Storyscan API Configuration
   STORYSCAN_BASE=https://www.storyscan.io
   RATE_LIMIT_MIN_TIME_MS=120
   
   # Ingestion Configuration
   INGEST_HOURS_BACK=6
   INGEST_INTERVAL_MINUTES=5
   
   # Server Configuration
   PORT=8080
   NODE_ENV=development
   ```

4. **Set up the database**
   ```bash
   # Create MySQL database
   mysql -u root -p -e "CREATE DATABASE story_stats CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   
   # Run migrations
   npm run db:migrate
   
   # Seed initial dApps
   npm run db:seed
   ```

## 🚀 Usage

### Starting the Service

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm run build
npm start
```

The service will:
- Start the API server on the configured port
- Begin scheduled ingestion of dApp data
- Log all activities to the console

### Manual Ingestion

```bash
# Ingest all configured dApps
npm run ingest

# Ingest specific dApp
npm run ingest story-hunt "Story Hunt"
```

### API Endpoints

#### Get dApp Statistics
```http
POST /api/dapps/stats
Content-Type: application/json

{
  "timeframe": "24H",
  "dapp_names": ["Story-Hunt", "Verio"],
  "include_sparklines": true
}
```

#### Response Format
```json
{
  "success": true,
  "data": [
    {
      "name": "Story Hunt",
      "users": {
        "current": 15420,
        "formatted": "15420",
        "change_24h": 5.2,
        "change_7d": 12.8,
        "change_30d": 45.3,
        "change_type": "positive"
      },
      "transactions": {
        "current_24h": 8950,
        "current_7d": 62340,
        "current_30d": 245680,
        "formatted": "8950",
        "change_24h": 3.1,
        "change_7d": 8.7,
        "change_30d": 23.4,
        "change_type": "positive"
      },
      "sparkline_data": [120, 135, 128, 142, 156, 148, 162],
      "sparkline_trend": "up",
      "last_updated": "2024-01-15T10:30:00Z"
    }
  ],
  "metadata": {
    "total_dapps": 1,
    "last_crawl": "2024-01-15T10:30:00Z",
    "data_sources": ["storyscan"]
  }
}
```

#### Health Check
```http
GET /health
```

## 📊 Database Schema

The service uses the following key tables:

- **`dapps`**: dApp information (slug, name, status)
- **`addresses`**: Blockchain addresses with metadata
- **`dapp_addresses`**: Many-to-many relationship between dApps and addresses
- **`dapp_stats_hourly`**: Hourly aggregated statistics
- **`dapp_hourly_users`**: Exact unique users per hour

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MYSQL_URL` | MySQL connection string | Required |
| `STORYSCAN_BASE` | Storyscan API base URL | `https://www.storyscan.io` |
| `RATE_LIMIT_MIN_TIME_MS` | API rate limit (ms between requests) | `120` |
| `INGEST_HOURS_BACK` | Hours of historical data to fetch | `6` |
| `INGEST_INTERVAL_MINUTES` | Ingestion frequency | `5` |
| `PORT` | API server port | `8080` |
| `NODE_ENV` | Environment mode | `development` |

### Customizing dApps

Edit `src/jobs/scheduler.ts` to modify the list of tracked dApps:

```typescript
const DEFAULT_DAPPS = [
  { slug: 'story-hunt', name: 'Story Hunt' },
  { slug: 'verio', name: 'Verio' },
  { slug: 'meta-pool', name: 'Meta Pool' },
  // Add your dApps here
];
```

## 🔧 Development

### Project Structure
```
src/
├── config/          # Environment configuration
├── db/             # Database connection and queries
├── clients/        # External API clients (Storyscan)
├── repos/          # Data access layer
├── jobs/           # Ingestion and scheduling
├── api/            # Express server and routes
├── utils/          # Utility functions
└── index.ts        # Main application entry point

scripts/
├── migrate.ts      # Database setup
├── seed-dapps.ts   # Initial dApp data
└── ingest.ts       # Manual ingestion
```

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Building
```bash
npm run build
```

## 📈 Monitoring

The service provides several monitoring endpoints:

- **Health Check**: `/health` - Overall service status
- **Scheduler Status**: Available through the scheduler module
- **Logs**: Comprehensive logging for all operations

### Key Metrics to Monitor

- Database connection health
- Ingestion job success rates
- API response times
- Storyscan API availability
- Memory and CPU usage

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify MySQL is running
   - Check connection string in `.env`
   - Ensure database exists and user has permissions

2. **Storyscan API Errors**
   - Check rate limiting settings
   - Verify API endpoint availability
   - Review network connectivity

3. **Ingestion Jobs Failing**
   - Check database schema
   - Verify dApp slugs exist
   - Review error logs for specific issues

### Debug Mode

Set `LOG_LEVEL=debug` in `.env` for verbose logging.

## 🔮 Future Enhancements

- **Multi-chain Support**: Extend to other blockchain networks
- **Advanced Analytics**: Gas usage, volume metrics, event decoding
- **Real-time Updates**: WebSocket support for live data
- **Dashboard UI**: Built-in visualization interface
- **Export Features**: CSV/JSON data export
- **Alerting**: Automated notifications for anomalies

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Create a GitHub issue
- Check the troubleshooting section
- Review the logs for error details

---

**Built with ❤️ for the Story Protocol ecosystem**
