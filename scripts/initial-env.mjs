import fs from 'node:fs';
import path from 'node:path';
import logger from './utils/logger.mjs';

const ROOT = process.cwd();
const ENV_TEMPLATE = path.join(ROOT, '.env.example');
const ENV_TARGET = path.join(ROOT, '.env');

const copyEnv = () => {
  if (!fs.existsSync(ENV_TEMPLATE)) {
    logger.error('Unable to bootstrap environment: missing .env.example template.');
    return false;
  }

  if (fs.existsSync(ENV_TARGET)) {
    logger.info('.env file already present. Skipping copy.');
    return true;
  }

  try {
    fs.copyFileSync(ENV_TEMPLATE, ENV_TARGET);
    logger.info('Created .env from .env.example');
    logger.warn('Review .env and add provider credentials before starting the app.');
    return true;
  } catch (error) {
    logger.error('Failed to create .env from template.', error);
    return false;
  }
};

const ensureDockerEnv = () => {
  const dockerDir = path.join(ROOT, 'docker');
  const dockerEnvPath = path.join(dockerDir, '.env');

  if (!fs.existsSync(dockerDir)) {
    logger.warn('No ./docker directory detected. Skipping docker env bootstrap.');
    return true;
  }

  if (fs.existsSync(dockerEnvPath)) {
    logger.info('docker/.env file already present. Skipping copy.');
    return true;
  }

  try {
    const template = fs.readFileSync(ENV_TEMPLATE, 'utf-8');
    const dockerTemplate = template.replace(
      /^POSTGRES_URL=.*$/m,
      [
        '# == DOCKER POSTGRES SETTINGS ==',
        'POSTGRES_URL=postgresql://soraai:soraai@postgres:5432/soraai',
        'POSTGRES_DB=soraai',
        'POSTGRES_USER=soraai',
        'POSTGRES_PASSWORD=soraai',
      ].join('\n'),
    );

    fs.mkdirSync(dockerDir, { recursive: true });
    fs.writeFileSync(dockerEnvPath, dockerTemplate, 'utf-8');
    logger.info('Created docker/.env with PostgreSQL defaults.');
    return true;
  } catch (error) {
    logger.error('Failed to create docker/.env file.', error);
    return false;
  }
};

const main = () => {
  const envReady = copyEnv();
  const dockerEnvReady = ensureDockerEnv();

  if (!envReady || !dockerEnvReady) {
    process.exit(1);
  }
};

main();
