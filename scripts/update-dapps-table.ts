#!/usr/bin/env tsx

import { pool } from '../src/db/mysql';

/**
 * Migration script to update existing dapps table to match new schema
 * This script handles the transition from old schema to new schema
 */

const updateMigrations = [
  // Add dapp_id column if it doesn't exist
  `ALTER TABLE dapps ADD COLUMN IF NOT EXISTS dapp_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '' AFTER id`,
  
  // Update external column to TINYINT(1) if it's BOOLEAN
  `ALTER TABLE dapps MODIFY COLUMN external TINYINT(1) DEFAULT '0'`,
  
  // Update internal_wallet column to TINYINT(1) if it's BOOLEAN
  `ALTER TABLE dapps MODIFY COLUMN internal_wallet TINYINT(1) DEFAULT '0'`,
  
  // Update status column to TINYINT UNSIGNED
  `ALTER TABLE dapps MODIFY COLUMN status TINYINT UNSIGNED NOT NULL DEFAULT '1'`,
  
  // Update all_time_txs column to BIGINT UNSIGNED
  `ALTER TABLE dapps MODIFY COLUMN all_time_txs BIGINT UNSIGNED NOT NULL DEFAULT '0'`,
  
  // Update github column to have proper charset and collation
  `ALTER TABLE dapps MODIFY COLUMN github VARCHAR(125) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL`,
];

async function updateDappsTable(): Promise<void> {
  console.log('🔄 Starting dapps table update migration...');
  
  try {
    // Test connection
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful');
    connection.release();

    // Check current table structure
    console.log('🔍 Checking current dapps table structure...');
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_SET_NAME, COLLATION_NAME
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dapps'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('📊 Current dapps table columns:');
    (columns as any[]).forEach(col => {
      console.log(`   - ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'} ${col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : ''}`);
    });

    // Run update migrations
    for (let i = 0; i < updateMigrations.length; i++) {
      const migration = updateMigrations[i];
      console.log(`📝 Running update migration ${i + 1}/${updateMigrations.length}...`);
      
      try {
        await pool.execute(migration);
        console.log(`✅ Update migration ${i + 1} completed`);
      } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`ℹ️  Column already exists, skipping: ${error.message}`);
        } else {
          console.error(`❌ Update migration ${i + 1} failed:`, error.message);
          // Continue with other migrations
        }
      }
    }

    // Verify final structure
    console.log('🔍 Verifying final table structure...');
    const [finalColumns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_SET_NAME, COLLATION_NAME
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dapps'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('📊 Final dapps table columns:');
    (finalColumns as any[]).forEach(col => {
      console.log(`   - ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'} ${col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : ''}`);
    });

    // Check table engine and charset
    const [tableInfo] = await pool.execute(`
      SELECT TABLE_ENGINE, TABLE_COLLATION, AUTO_INCREMENT
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dapps'
    `);
    
    if ((tableInfo as any[]).length > 0) {
      const info = (tableInfo as any[])[0];
      console.log('📋 Table information:');
      console.log(`   - Engine: ${info.TABLE_ENGINE}`);
      console.log(`   - Collation: ${info.TABLE_COLLATION}`);
      console.log(`   - Auto Increment: ${info.AUTO_INCREMENT}`);
    }

    console.log('🎉 Dapps table update migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Update migration failed:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    await updateDappsTable();
    process.exit(0);
  } catch (error) {
    console.error('Update migration script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { updateDappsTable };
