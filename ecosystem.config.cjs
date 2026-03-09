module.exports = {
  apps: [
    {
      name: 'server',
      cwd: __dirname,
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      ignore_watch: ['.git', 'node_modules', 'uploads', 'uploads_v2', 'outputs_v2', 'tmp_compare', 'test_outputs'],
      vizion: false,
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 5,
      kill_timeout: 10000,
      max_memory_restart: '700M',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'stitch-server',
      cwd: __dirname,
      script: 'stitch-server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      ignore_watch: ['.git', 'node_modules', 'uploads', 'uploads_v2', 'outputs_v2', 'tmp_compare', 'test_outputs'],
      vizion: false,
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 5,
      kill_timeout: 10000,
      max_memory_restart: '700M',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'render-v2',
      cwd: __dirname,
      script: 'render-v2.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      ignore_watch: ['.git', 'node_modules', 'uploads', 'uploads_v2', 'outputs_v2', 'tmp_compare', 'test_outputs'],
      vizion: false,
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 5,
      kill_timeout: 10000,
      max_memory_restart: '700M',
      env: { NODE_ENV: 'production', PORT: 3002 }
    }
  ]
};
