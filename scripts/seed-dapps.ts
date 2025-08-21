import { pool } from '../src/db/mysql';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Seed script for dApps from JSON file
 * Reads dApps data from misc/dapps.json and imports to database
 */

interface DappData {
  id: string;
  title: string;
  external: boolean;
  internalWallet: boolean;
  priority: number | null;
  logo: string | null;
  logoDarkMode: string | null;
  shortDescription: string;
  categories: string[];
  author: string;
  url: string;
  description: string;
  site: string;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  github: string[];
}

async function seedDapps(): Promise<void> {
  console.log('🌱 Starting dApp seeding from JSON file...');
  
  try {
    // Test connection
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful');
    connection.release();

    // Read JSON file
    const jsonPath = path.join(__dirname, '..', 'misc', 'dapps.json');
    console.log(`📖 Reading dApps from: ${jsonPath}`);
    
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`dApps JSON file not found at: ${jsonPath}`);
    }

    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const dapps: DappData[] = JSON.parse(jsonContent);
    
    console.log(`📊 Found ${dapps.length} dApps in JSON file`);

    // Insert dApps
    let insertedCount = 0;
    let skippedCount = 0;
    
    for (const dapp of dapps) {
      try {
        // Convert categories array to comma-separated string
        const categoriesString = dapp.categories.join(', ');
        
        // Prepare dApp data for database
        const dappData = {
          slug: dapp.id, // Use id as slug
          title: dapp.title,
          external: dapp.external,
          internal_wallet: dapp.internalWallet,
          priority: dapp.priority,
          logo: dapp.logo,
          logo_dark_mode: dapp.logoDarkMode,
          short_description: dapp.shortDescription,
          categories: categoriesString,
          author: dapp.author,
          url: dapp.url,
          description: dapp.description,
          site: dapp.site,
          twitter: dapp.twitter,
          telegram: dapp.telegram,
          discord: dapp.discord,
          github: dapp.github && dapp.github.length > 0 ? dapp.github[0] : null // Take first GitHub URL only
        };

        await pool.execute(
          `INSERT IGNORE INTO dapps (
            slug, title, external, internal_wallet, priority, logo, logo_dark_mode,
            short_description, categories, author, url, description, site,
            twitter, telegram, discord, github
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dappData.slug,
            dappData.title,
            dappData.external,
            dappData.internal_wallet,
            dappData.priority,
            dappData.logo,
            dappData.logo_dark_mode,
            dappData.short_description,
            dappData.categories,
            dappData.author,
            dappData.url,
            dappData.description,
            dappData.site,
            dappData.twitter,
            dappData.telegram,
            dappData.discord,
            dappData.github
          ]
        );
        
        insertedCount++;
        console.log(`✅ Added dApp: ${dapp.title} (${dapp.id})`);
      } catch (error) {
        skippedCount++;
        console.warn(`⚠️  Could not add dApp ${dapp.id}:`, error);
      }
    }

    // Verify seeding
    const [rows] = await pool.execute('SELECT COUNT(*) as count FROM dapps');
    const totalCount = (rows as any)[0].count;
    console.log(`📊 Total dApps in database: ${totalCount}`);
    console.log(`✅ Successfully inserted: ${insertedCount} dApps`);
    console.log(`⚠️  Skipped: ${skippedCount} dApps`);

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
