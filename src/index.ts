import { startServer } from './api/server';
import { startScheduler } from './jobs/scheduler';
import { testConnection, closePool } from './db/mysql';
import { storyscanClient } from './clients/storyscan';
import { serverConfig } from './config/env';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  console.log('🚀 Starting Story Protocol dApp Stats Service...');
  console.log(`🌍 Environment: ${serverConfig.nodeEnv}`);
  console.log(`⏰ Time: ${new Date().toISOString()}`);

  try {
    // Test database connection
    console.log('🔌 Testing database connection...');
    await testConnection();

    // Test Storyscan API connection
    console.log('🔌 Testing Storyscan API connection...');
    const storyscanHealthy = await storyscanClient.healthCheck();
    if (!storyscanHealthy) {
      console.warn('⚠️  Storyscan API health check failed, but continuing...');
    } else {
      console.log('✅ Storyscan API connection successful');
    }

    // Start the ingestion scheduler
    console.log('⏰ Starting ingestion scheduler...');
    startScheduler();

    // Start the API server
    console.log('🌐 Starting API server...');
    await startServer();

    console.log('🎉 Application started successfully!');
    console.log('📊 The service is now collecting dApp statistics and serving API requests.');

  } catch (error) {
    console.error('❌ Failed to start application:', error);
    
    // Cleanup on failure
    try {
      await closePool();
      await storyscanClient.close();
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close database connections
    await closePool();
    console.log('✅ Database connections closed');
    
    // Close Storyscan client
    await storyscanClient.close();
    console.log('✅ Storyscan client closed');
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the application
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Application startup failed:', error);
    process.exit(1);
  });
}

export default main;
