import { ingestDapp, ingestMultipleDapps } from '../src/jobs/ingest';

/**
 * Manual ingestion script
 * Can be used to manually trigger data ingestion for dApps
 */

const dappsToIngest = [
  { slug: 'storyhunt', title: 'StoryHunt' },
  { slug: 'verio', title: 'Verio' },
  { slug: 'piperx', title: 'PiperX' }
];

async function manualIngestion(): Promise<void> {
  console.log('🔄 Starting manual ingestion...');
  console.log(`📱 Processing ${dappsToIngest.length} dApps`);
  
  try {
    // Option 1: Ingest multiple dApps
    console.log('\n🚀 Running batch ingestion...');
    const results = await ingestMultipleDapps(dappsToIngest);
    
    // Display results
    console.log('\n📊 Ingestion Results:');
    results.forEach((result, index) => {
      const dapp = dappsToIngest[index];
      if (result.success) {
        console.log(`✅ ${dapp.title}: ${result.transactionsProcessed} transactions, ${result.hoursTouched} hours touched`);
      } else {
        console.log(`❌ ${dapp.title}: ${result.error}`);
      }
    });
    
    const successCount = results.filter(r => r.success).length;
    const totalTransactions = results.reduce((sum, r) => sum + r.transactionsProcessed, 0);
    
    console.log(`\n🎉 Batch ingestion completed: ${successCount}/${results.length} successful`);
    console.log(`📈 Total transactions processed: ${totalTransactions}`);
    
  } catch (error) {
    console.error('❌ Manual ingestion failed:', error);
    throw error;
  }
}

async function ingestSingleDapp(slug: string, title: string): Promise<void> {
  console.log(`🔄 Starting manual ingestion for ${title} (${slug})...`);
  
  try {
    const result = await ingestDapp(slug, title);
    
    if (result.success) {
      console.log(`✅ ${title} ingestion completed successfully!`);
      console.log(`📊 Transactions processed: ${result.transactionsProcessed}`);
      console.log(`⏰ Hours touched: ${result.hoursTouched}`);
      console.log(`⏱️  Duration: ${result.duration}ms`);
    } else {
      console.error(`❌ ${title} ingestion failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error(`❌ Error ingesting ${title}:`, error);
    throw error;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  try {
    if (args.length === 0) {
      // No arguments, run batch ingestion
      await manualIngestion();
    } else if (args.length === 2) {
      // Two arguments: slug and title
      const [slug, title] = args;
      await ingestSingleDapp(slug, title);
    } else {
      console.log('Usage:');
      console.log('  npm run ingest                    # Run batch ingestion for all dApps');
      console.log('  npm run ingest <slug> <title>     # Ingest specific dApp');
      console.log('');
      console.log('Examples:');
      console.log('  npm run ingest story-hunt "Story Hunt"');
      console.log('  npm run ingest verio "Verio"');
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Ingestion script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { manualIngestion, ingestSingleDapp };
