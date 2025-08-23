module.exports = {
  apps: [{
    name: 'story-dapp-api',
    script: 'dist/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 8002
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8002
    },
    log_file: '/var/log/story-dapp/combined.log',
    out_file: '/var/log/story-dapp/out.log',
    error_file: '/var/log/story-dapp/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
    ignore_watch: ['node_modules', 'logs', '*.log']
  }]
};
