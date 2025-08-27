#!/usr/bin/env tsx

import { pool } from '../src/db/mysql';
import { readFileSync } from 'fs';
import { join } from 'path';

async function updateSchema(): Promise<void> {
  console.log('🔧 Updating database schema...');
  
  try {
    // Read the SQL file
    const sqlPath = join(__dirname, 'update-schema.sql');
    const sqlContent = readFileSync(sqlPath, 'utf8');
    
    // Split into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`   Executing statement ${i + 1}/${statements.length}...`);
        try {
          await pool.execute(statement);
          console.log(`   ✅ Statement ${i + 1} completed`);
        } catch (error: any) {
          if (error.code === 'ER_DUP_KEYNAME') {
            console.log(`   ⚠️  Statement ${i + 1} skipped (constraint already exists)`);
          } else {
            console.error(`   ❌ Statement ${i + 1} failed:`, error.message);
          }
        }
      }
    }
    
    console.log('🎉 Schema update completed successfully!');
    
  } catch (error) {
    console.error('❌ Schema update failed:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    await updateSchema();
    process.exit(0);
  } catch (error) {
    console.error('Schema update script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
