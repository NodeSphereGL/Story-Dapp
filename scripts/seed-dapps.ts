import { pool } from '../src/db/mysql';

/**
 * Seed script for initial dApps
 * Adds popular Story Protocol dApps to the database
 */

const initialDapps = [
  { slug: 'story-hunt', name: 'Story Hunt' },
  { slug: 'verio', name: 'Verio' },
  { slug: 'meta-pool', name: 'Meta Pool' },
  { slug: 'story-protocol', name: 'Story Protocol' },
  { slug: 'story-token', name: 'Story Token' }
];

async function seedDapps(): Promise<void> {
  console.log('🌱 Starting dApp seeding...');
  
  try {
    // Test connection
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful');
    connection.release();

    // Insert dApps
    for (const dapp of initialDapps) {
      try {
        await pool.execute(
          'INSERT IGNORE INTO dapps (slug, name) VALUES (?, ?)',
          [dapp.slug, dapp.name]
        );
        console.log(`✅ Added dApp: ${dapp.name} (${dapp.slug})`);
      } catch (error) {
        console.warn(`⚠️  Could not add dApp ${dapp.slug}:`, error);
      }
    }

    // Verify seeding
    const [rows] = await pool.execute('SELECT COUNT(*) as count FROM dapps');
    const count = (rows as any)[0].count;
    console.log(`📊 Total dApps in database: ${count}`);

    console.log('🎉 dApp seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ dApp seeding failed:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    await seedDapps();
    process.exit(0);
  } catch (error) {
    console.error('Seed script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { seedDapps };
