import { pool } from '../src/db/mysql';

/**
 * Database migration script for Story Protocol dApp Stats
 * Creates all required tables and indexes
 */

const migrations = [
  // Create chains table
  `CREATE TABLE IF NOT EXISTS chains (
    id SMALLINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(64) NOT NULL,
    chain_key VARCHAR(64) NOT NULL,
    chain_id VARCHAR(64) NULL,
    explorer_base_url VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_chain (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Create dapps table
  `CREATE TABLE IF NOT EXISTS dapps (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dapp_id VARCHAR(64) NOT NULL UNIQUE,
    slug VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    external BOOLEAN DEFAULT FALSE,
    internal_wallet BOOLEAN DEFAULT FALSE,
    priority INT NULL,
    logo VARCHAR(500) NULL,
    logo_dark_mode VARCHAR(500) NULL,
    short_description TEXT NULL,
    categories TEXT NULL,
    author VARCHAR(255) NULL,
    url VARCHAR(500) NULL,
    description TEXT NULL,
    site VARCHAR(500) NULL,
    twitter VARCHAR(500) NULL,
    telegram VARCHAR(500) NULL,
    discord VARCHAR(500) NULL,
    github VARCHAR(125) NULL,
    all_time_txs BIGINT DEFAULT 0,
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Create addresses table
  `CREATE TABLE IF NOT EXISTS addresses (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    chain_id SMALLINT NOT NULL,
    address_hash CHAR(42) NOT NULL,
    label VARCHAR(128) NULL,
    address_type VARCHAR(32) NULL,
    first_seen_at DATETIME NULL,
    last_seen_at DATETIME NULL,
    UNIQUE KEY uniq_addr_chain (address_hash, chain_id),
    KEY idx_addr_chain (chain_id),
    CONSTRAINT fk_addr_chain FOREIGN KEY (chain_id) REFERENCES chains(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Create dapp_addresses table
  `CREATE TABLE IF NOT EXISTS dapp_addresses (
    dapp_id BIGINT NOT NULL,
    address_id BIGINT NOT NULL,
    role VARCHAR(64) NULL,
    PRIMARY KEY (dapp_id, address_id),
    KEY idx_da_dapp (dapp_id),
    KEY idx_da_addr (address_id),
    CONSTRAINT fk_da_dapp FOREIGN KEY (dapp_id) REFERENCES dapps(id),
    CONSTRAINT fk_da_addr FOREIGN KEY (address_id) REFERENCES addresses(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Create dapp_stats_hourly table
  `CREATE TABLE IF NOT EXISTS dapp_stats_hourly (
    dapp_id BIGINT NOT NULL,
    chain_id SMALLINT NOT NULL,
    ts_hour DATETIME NOT NULL,
    tx_count INT NOT NULL DEFAULT 0,
    unique_users INT NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (dapp_id, chain_id, ts_hour),
    KEY idx_dsh_time (ts_hour),
    KEY idx_dsh_dapp_time (dapp_id, ts_hour),
    CONSTRAINT fk_dsh_chain FOREIGN KEY (chain_id) REFERENCES chains(id),
    CONSTRAINT fk_dsh_dapp FOREIGN KEY (dapp_id) REFERENCES dapps(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Create dapp_hourly_users table
  `CREATE TABLE IF NOT EXISTS dapp_hourly_users (
    dapp_id BIGINT NOT NULL,
    chain_id SMALLINT NOT NULL,
    ts_hour DATETIME NOT NULL,
    user_address CHAR(42) NOT NULL,
    PRIMARY KEY (dapp_id, chain_id, ts_hour, user_address),
    KEY idx_dhu_dapp_time (dapp_id, ts_hour),
    CONSTRAINT fk_dhu_chain FOREIGN KEY (chain_id) REFERENCES chains(id),
    CONSTRAINT fk_dhu_dapp FOREIGN KEY (dapp_id) REFERENCES dapps(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Create data_sources table
  `CREATE TABLE IF NOT EXISTS data_sources (
    id INT PRIMARY KEY AUTO_INCREMENT,
    source VARCHAR(64) NOT NULL,
    meta JSON NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_source (source)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Create ingestion_runs table
  `CREATE TABLE IF NOT EXISTS ingestion_runs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    source_id INT NOT NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    status VARCHAR(32) NOT NULL,
    notes TEXT NULL,
    CONSTRAINT fk_ir_source FOREIGN KEY (source_id) REFERENCES data_sources(id),
    KEY idx_ir_time (started_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

const seedData = [
  // Insert default chain
  `INSERT IGNORE INTO chains(name, chain_key) VALUES ('story', 'story')`,
  
  // Insert default data source
  `INSERT IGNORE INTO data_sources(source) VALUES ('storyscan')`
];

async function runMigrations(): Promise<void> {
  console.log('🚀 Starting database migration...');
  
  try {
    // Test connection
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful');
    connection.release();

    // Run migrations
    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      console.log(`📝 Running migration ${i + 1}/${migrations.length}...`);
      
      try {
        await pool.execute(migration);
        console.log(`✅ Migration ${i + 1} completed`);
      } catch (error) {
        console.error(`❌ Migration ${i + 1} failed:`, error);
        throw error;
      }
    }

    // Insert seed data
    console.log('🌱 Inserting seed data...');
    for (const seed of seedData) {
      try {
        await pool.execute(seed);
      } catch (error) {
        console.warn(`⚠️  Seed data insertion warning:`, error);
      }
    }

    console.log('🎉 Database migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    await runMigrations();
    process.exit(0);
  } catch (error) {
    console.error('Migration script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { runMigrations };
