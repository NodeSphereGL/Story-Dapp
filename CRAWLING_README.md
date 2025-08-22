# 🚀 Complete dApp Data Crawling System

This document explains how to use the comprehensive dApp crawling system that follows your specified logic:

1. **Select all dApps from DB**: `SELECT * FROM dapps WHERE status = 1 ORDER BY priority ASC`
2. **Get addresses for each dApp**: Call API to get addresses → insert to DB
3. **Get transactions for each address**: Sum total txs then insert to DB
4. **Calculate unique users**: Get FROM addresses and insert to DB

## 📋 Available Scripts

### 1. **Crawl All dApps** (`npm run crawl:all`)
Main script that crawls all active dApps according to your logic.

### 2. **Update All-Time Transaction Counts** (`npm run dapp:update-txs`)
Update all dApps with their total transaction counts from the API.

## ⚙️ **Priority Configuration**

Set dApp priorities directly in the database:

```sql
-- Set priorities (1=high, 2=medium, 3=low)
UPDATE dapps SET priority = 1 WHERE slug = 'story-hunt';
UPDATE dapps SET priority = 2 WHERE slug = 'verio';
UPDATE dapps SET priority = 3 WHERE slug = 'unleash';

-- Set status (1=active, 0=inactive)
UPDATE dapps SET status = 1 WHERE slug = 'story-hunt';

-- View current configuration
SELECT id, slug, title, priority, status FROM dapps WHERE status = 1 ORDER BY priority ASC;
```

**Priority System:**
- **Priority 1**: High priority (crawled first)
- **Priority 2**: Medium priority  
- **Priority 3**: Low priority
- **Status 1**: Active (will be crawled)
- **Status 0**: Inactive (skipped)

```bash
npm run crawl:all
```

## 🔄 Complete Data Flow

### **Step 1: Database Selection**
```sql
SELECT id, dapp_id, slug, title, priority, status 
FROM dapps 
WHERE status = 1 
ORDER BY priority ASC, id ASC
```

### **Step 2: Address Discovery**
For each dApp:
1. Call Storyscan API: `/api/v2/proxy/metadata/addresses?slug={slug}&tag_type=protocol`
2. Insert new addresses into `addresses` table
3. Link addresses to dApp in `dapp_addresses` table

### **Step 3: Transaction Processing**
For each address:
1. Call Storyscan API: `/api/v2/addresses/{address}/transactions`
2. Process transactions (skip failed ones)
3. Floor timestamps to UTC hours
4. Insert into `dapp_stats_hourly` (tx_count)
5. Insert into `dapp_hourly_users` (unique users)

### **Step 4: Data Aggregation**
1. Sum transaction counts per hour
2. Count unique users per hour
3. Update `unique_users` field in `dapp_stats_hourly`

## 📊 Database Tables Used

### **`dapps`**
- `id`: Primary key
- `slug`: dApp identifier
- `title`: Display name
- `priority`: Crawling priority (1=high, 2=medium, 3=low)
- `status`: Active status (1=active, 0=inactive)

### **`addresses`**
- `id`: Primary key
- `chain_id`: Blockchain identifier
- `address_hash`: Contract/wallet address
- `label`: Human-readable name
- `address_type`: Type (contract, wallet, etc.)

### **`dapp_addresses`**
- `dapp_id`: Reference to dApp
- `address_id`: Reference to address
- `role`: Relationship role

### **`dapp_stats_hourly`**
- `dapp_id`: Reference to dApp
- `chain_id`: Reference to blockchain
- `ts_hour`: Hour timestamp (UTC, floored)
- `tx_count`: Transaction count for this hour
- `unique_users`: Unique user count for this hour

### **`dapp_hourly_users`**
- `dapp_id`: Reference to dApp
- `chain_id`: Reference to blockchain
- `ts_hour`: Hour timestamp
- `user_address`: User's wallet address

## 🎯 Example Output

### **Priority Configuration:**
```
📋 Current dApp Status:
ID  | Slug                | Title              | Priority | Status
----|---------------------|-------------------|----------|---------
 38 | story-hunt          | Story Hunt         |      P1  | 🟢 Active
 39 | verio               | Verio              |      P1  | 🟢 Active
 40 | story-protocol      | Story Protocol     |      P2  | 🟢 Active
```

### **Crawling Progress:**
```
🔄 Processing dApp: Story Hunt (story-hunt)
   Priority: 1
   🔍 Fetching addresses for story-hunt...
   📡 API returned 10 address items
   📍 Found 10 addresses
   📊 Processing transactions for 10 addresses...
   ⏰ Processing transactions from 2025-07-23T10:00:00.000Z onwards
     🔍 Processing address: 0x06323fe9eee6b78d6bd1ddff51eef790aceec0bd
       📈 Address 0x06323fe9eee6b78d6bd1ddff51eef790aceec0bd: 45 txs, 23 users
   📊 Summary for Story Hunt: 245 total txs, 89 unique users, 67 hours
   💾 Refreshing unique user counts for 67 hours...
   ✅ Aggregated data inserted for Story Hunt
```

## ⚙️ Configuration Options

### **Time Window**
Currently set to crawl transactions from **30 days ago** onwards:
```typescript
const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
```

### **Rate Limiting**
Uses the existing Storyscan client with rate limiting and retry logic.

### **Error Handling**
- Individual dApp failures don't stop the entire process
- Address failures are logged but processing continues
- Transaction failures are logged but processing continues

## 🚀 Usage Examples

### **Quick Start:**
```bash
# 1. Set dApp priorities
npm run dapp:priorities

# 2. Start crawling all dApps
npm run crawl:all
```

### **Monitor Progress:**
```bash
# View current dApp status
npm run dapp:priorities -- --status

# Check database stats
mysql -u username -p database_name -e "
  SELECT COUNT(*) as active_dapps FROM dapps WHERE status = 1;
  SELECT SUM(tx_count) as total_transactions FROM dapp_stats_hourly;
  SELECT COUNT(DISTINCT user_address) as unique_users FROM dapp_hourly_users;
"
```

### **Custom Time Windows:**
To modify the crawling time window, edit `scripts/crawl-all.ts`:
```typescript
// Change from 30 days to custom period
const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
// or
const cutoffTime = new Date('2025-01-01'); // From specific date
```

## 📈 Expected Results

After running the crawling script, you should have:

1. **Complete dApp coverage**: All active dApps processed
2. **Address discovery**: All contract addresses linked to dApps
3. **Transaction data**: Hourly aggregated transaction counts
4. **User analytics**: Unique user counts per hour
5. **Time series data**: Continuous data for API endpoints

## 🔍 Troubleshooting

### **Common Issues:**

1. **API Rate Limits**: The script includes rate limiting, but if you hit limits, wait and retry
2. **Database Connections**: Ensure MySQL is running and accessible
3. **Memory Usage**: For large dApps, the script processes data incrementally
4. **Network Issues**: Failed API calls are logged and processing continues

### **Debug Mode:**
The script includes extensive logging. Check console output for:
- Progress updates
- Error details
- Processing statistics
- Database operations

## 🎯 Next Steps

1. **Set dApp priorities** based on your business needs
2. **Run initial crawl** to populate the database
3. **Monitor progress** and adjust priorities as needed
4. **Set up scheduling** to run periodically (e.g., daily)
5. **Use API endpoints** to serve the aggregated data

The system is designed to be robust and handle large-scale crawling operations efficiently! 🚀
