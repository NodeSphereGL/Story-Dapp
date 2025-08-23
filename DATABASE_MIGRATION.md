# 🗄️ Database Migration Guide

This document explains the database migration changes for the Story Protocol dApp Statistics Service.

## 📋 **Migration Overview**

The `dapps` table schema has been updated to match your current production database structure. The main changes include:

### **🔄 Schema Changes**

| Field | Old Type | New Type | Notes |
|-------|----------|----------|-------|
| `id` | `BIGINT PRIMARY KEY AUTO_INCREMENT` | `BIGINT NOT NULL AUTO_INCREMENT` | Standardized format |
| `dapp_id` | ❌ Not present | `VARCHAR(64) NOT NULL DEFAULT ''` | **NEW FIELD** - Unique dApp identifier |
| `slug` | `VARCHAR(64) NOT NULL UNIQUE` | `VARCHAR(64) NOT NULL` | Removed duplicate unique constraint |
| `external` | `BOOLEAN DEFAULT FALSE` | `TINYINT(1) DEFAULT '0'` | MySQL boolean compatibility |
| `internal_wallet` | `BOOLEAN DEFAULT FALSE` | `TINYINT(1) DEFAULT '0'` | MySQL boolean compatibility |
| `status` | `TINYINT DEFAULT 1` | `TINYINT UNSIGNED NOT NULL DEFAULT '1'` | Added NOT NULL constraint |
| `all_time_txs` | `BIGINT DEFAULT 0` | `BIGINT UNSIGNED NOT NULL DEFAULT '0'` | Added NOT NULL constraint |
| `github` | `VARCHAR(125) NULL` | `VARCHAR(125) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL` | Proper charset/collation |

### **🔧 Additional Changes**

- **Character Set**: Updated to `utf8mb4` with `utf8mb4_0900_ai_ci` collation
- **Auto Increment**: Set to start from 58
- **Primary Key**: Moved to separate line for clarity
- **Unique Keys**: Consolidated unique constraints

## 🚀 **Migration Scripts**

### **1. Full Migration (New Database)**
```bash
npm run db:migrate
```
**Use this for:**
- Fresh database installations
- Development environments
- When you want to recreate the entire schema

### **2. Update Migration (Existing Database)**
```bash
npm run db:update-dapps
```
**Use this for:**
- Updating existing production databases
- When you want to preserve existing data
- Schema migrations in production

## 📊 **Current Schema (Target)**

```sql
CREATE TABLE `dapps` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `dapp_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '',
  `slug` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `external` tinyint(1) DEFAULT '0',
  `internal_wallet` tinyint(1) DEFAULT '0',
  `priority` int DEFAULT NULL,
  `logo` varchar(500) DEFAULT NULL,
  `logo_dark_mode` varchar(500) DEFAULT NULL,
  `short_description` text,
  `categories` text,
  `author` varchar(255) DEFAULT NULL,
  `url` varchar(500) DEFAULT NULL,
  `description` text,
  `site` varchar(500) DEFAULT NULL,
  `twitter` varchar(500) DEFAULT NULL,
  `telegram` varchar(500) DEFAULT NULL,
  `discord` varchar(500) DEFAULT NULL,
  `github` varchar(125) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `status` tinyint unsigned NOT NULL DEFAULT '1',
  `all_time_txs` bigint unsigned NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## 🔍 **Migration Process**

### **For New Databases:**
1. Run `npm run db:migrate`
2. This creates all tables with the new schema
3. Inserts seed data (chains, data_sources)

### **For Existing Databases:**
1. Run `npm run db:update-dapps`
2. This safely updates the existing `dapps` table
3. Preserves all existing data
4. Shows before/after table structure

## ⚠️ **Important Notes**

### **Data Preservation:**
- **All existing data is preserved** during updates
- **No data loss** occurs during migration
- **Rollback is possible** if needed

### **Downtime:**
- **Minimal downtime** during schema updates
- **Read operations continue** during migration
- **Write operations may be briefly paused**

### **Compatibility:**
- **MySQL 8.0+** required for new features
- **Backward compatible** with existing applications
- **API endpoints unchanged**

## 🚨 **Troubleshooting**

### **Common Issues:**

**1. Column Already Exists:**
```
ℹ️  Column already exists, skipping: Duplicate column name 'dapp_id'
```
**Solution:** This is normal, the column was already added.

**2. Permission Denied:**
```
❌ Access denied for user 'story_user'@'localhost'
```
**Solution:** Ensure the database user has ALTER privileges.

**3. Table Locked:**
```
❌ Table 'dapps' is locked
```
**Solution:** Wait for any active transactions to complete.

### **Verification:**
After migration, verify the structure:
```bash
# Check table structure
mysql -u story_user -p story_dapp -e "DESCRIBE dapps;"

# Check charset and collation
mysql -u story_user -p story_dapp -e "SHOW TABLE STATUS LIKE 'dapps';"
```

## 🔄 **Rollback (If Needed)**

If you need to rollback the changes:

```sql
-- Remove dapp_id column
ALTER TABLE dapps DROP COLUMN dapp_id;

-- Revert status column
ALTER TABLE dapps MODIFY COLUMN status TINYINT DEFAULT 1;

-- Revert all_time_txs column
ALTER TABLE dapps MODIFY COLUMN all_time_txs BIGINT DEFAULT 0;

-- Revert table charset
ALTER TABLE dapps CONVERT TO CHARACTER SET utf8mb4;
```

## 📚 **Related Files**

- **`scripts/migrate.ts`** - Full database migration
- **`scripts/update-dapps-table.ts`** - dApps table update migration
- **`src/db/queries.ts`** - Database query interfaces
- **`src/repos/dapps.ts`** - dApp repository operations

## 🎯 **Next Steps**

1. **Run the appropriate migration** for your environment
2. **Verify the table structure** matches the target schema
3. **Test your application** to ensure everything works
4. **Update any external tools** that connect to the database

---

**🎉 Your database is now ready for production with the updated schema!**
