import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import './load-env.mjs';
import logger from './utils/logger.mjs';
import {
  FILE_BASED_MCP_CONFIG,
  IS_DOCKER_ENV,
  IS_VERCEL_ENV,
} from './utils/runtime.mjs';

const execAsync = promisify(exec);

const runCommand = async (command, description) => {
  logger.info(`Starting: ${description}`);
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      env: process.env,
    });

    if (stdout) {
      logger.debug(`${description} stdout:\n${stdout}`);
    }
    if (stderr) {
      logger.warn(`${description} stderr:\n${stderr}`);
    }

    logger.success(`${description} completed successfully.`);
  } catch (error) {
    logger.error(`${description} failed.`, error);
    throw error;
  }
};

const main = async () => {
  if (IS_VERCEL_ENV) {
    if (FILE_BASED_MCP_CONFIG) {
      logger.error('FILE_BASED_MCP_CONFIG is not supported on Vercel deployments.');
      process.exit(1);
    }

    logger.info('Detected Vercel environment. Triggering database migrations.');
    await runCommand('pnpm db:migrate', 'Database migration');

    if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
      logger.info('Seeding admin user as part of Vercel deployment.');
      await runCommand('pnpm seed:admin', 'Admin user seed');
    } else {
      logger.info('SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not set. Skipping admin seed.');
    }
    return;
  }

  if (IS_DOCKER_ENV) {
    if (FILE_BASED_MCP_CONFIG) {
      logger.error('FILE_BASED_MCP_CONFIG is not supported inside Docker builds.');
      process.exit(1);
    }

    logger.info('Docker build detected. Skipping local postinstall tasks.');
    return;
  }

  logger.info('Local environment detected. Ensuring env files exist.');
  await runCommand('pnpm initial:env', 'Initial environment setup');
  await runCommand(
    'pnpm openai-compatiable:init',
    'OpenAI compatible config scaffold',
  );
};

main().catch((error) => {
  logger.error('Postinstall hook failed.', error);
  process.exit(1);
});
