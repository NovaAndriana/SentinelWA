/**
 * PM2 process definition for an on-premise SentinelWA node.
 *
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save && pm2 startup
 *
 * Deliberately single-instance: the rate-limit buckets, circuit breaker and SSE
 * fan-out all live in process memory. Running `instances: 'max'` in cluster mode
 * would give each worker its own copy, so a key's limit would multiply by the
 * worker count and a dashboard would only see the events of whichever worker it
 * happened to connect to. Scale vertically, or move that state to Redis first.
 */
module.exports = {
  apps: [
    {
      name: 'sentinelwa',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      listen_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
