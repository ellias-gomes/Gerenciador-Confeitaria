const os = require('os');
const env = require('./config/env');
const { initDatabase } = require('./config/database');
const createApp = require('./app');

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(interfaces)) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const port = Number(process.argv[2]) || Number(process.env.PORT) || env.PORT;
const host = process.env.HOST || env.HOST || '0.0.0.0';

const db = initDatabase();
const app = createApp(db);

app.listen(port, host, () => {
  const lanIps = getLanAddresses();
  console.log('\n======================================================');
  console.log(`  ${env.BAKERY_NAME} - Sistema Web & API Android`);
  console.log('======================================================');
  console.log(`  Web Local:    http://localhost:${port}`);
  if (lanIps.length > 0) {
    for (const ip of lanIps) {
      console.log(`  Rede/Android: http://${ip}:${port}`);
    }
  }
  console.log(`  Banco SQLite: ${env.DB_PATH}`);
  console.log('======================================================\n');
});
