#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'frontend', 'src', 'config.js');

function switchEnvironment(env) {
  if (!['local', 'render'].includes(env)) {
    console.error('Usage: node switch-env.js <local|render>');
    console.error('  local  - Switch to localhost development');
    console.error('  render - Switch to Render production');
    process.exit(1);
  }

  try {
    let configContent = fs.readFileSync(configPath, 'utf8');
    
    if (env === 'local') {
      configContent = configContent.replace(
        /const USE_RENDER = true;/,
        'const USE_RENDER = false;'
      );
      console.log('✅ Switched to LOCALHOST environment');
    } else {
      configContent = configContent.replace(
        /const USE_RENDER = false;/,
        'const USE_RENDER = true;'
      );
      console.log('✅ Switched to RENDER environment');
    }
    
    fs.writeFileSync(configPath, configContent);
    console.log(`📁 Updated: ${configPath}`);
    
  } catch (error) {
    console.error('❌ Error switching environment:', error.message);
    process.exit(1);
  }
}

const env = process.argv[2];
switchEnvironment(env); 