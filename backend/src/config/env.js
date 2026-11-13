const path = require('path');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const rawDbPath = process.env.DB_PATH || './backend/data/confeitaria.db';
const resolvedDbPath = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.resolve(ROOT_DIR, rawDbPath);

const env = {
  ROOT_DIR,
  PORT: Number(process.env.PORT) || 8080,
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-secret-only-for-automated-tests' : ''),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  DB_PATH: resolvedDbPath,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  DEFAULT_REGISTER_ROLE: ['visualizador', 'atendente'].includes(process.env.DEFAULT_REGISTER_ROLE)
    ? process.env.DEFAULT_REGISTER_ROLE
    : 'visualizador',
  ADMIN_NAME: process.env.ADMIN_NAME || 'Proprietária Confeitaria',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@confeitaria.local',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Confeitaria@2026',
  BAKERY_NAME: process.env.BAKERY_NAME || 'Doce Encanto Confeitaria',
};

if (!env.JWT_SECRET) {
  throw new Error('JWT_SECRET não definido no arquivo .env. Configure um segredo antes de iniciar.');
}

module.exports = env;
