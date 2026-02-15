import fs from 'fs';
import path from 'path';

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
};

type AppConfig = {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  smtp: SmtpConfig;
  googleClientId: string;
};

function loadJsonFile(filePath: string): unknown {
  let raw = fs.readFileSync(filePath, 'utf8');
  // Strip UTF-8 BOM or other leading whitespace that can break JSON.parse
  raw = raw.replace(/^\uFEFF/, '').trimStart();
  return JSON.parse(raw);
}

function assertConfig(value: any): asserts value is AppConfig {
  if (!value || typeof value !== 'object') throw new Error('config.json is missing or invalid JSON');
  if (typeof value.port !== 'number') throw new Error('config.json: "port" must be a number');
  if (typeof value.databaseUrl !== 'string' || !value.databaseUrl) {
    throw new Error('config.json: "databaseUrl" must be a non-empty string');
  }
  if (typeof value.jwtSecret !== 'string' || value.jwtSecret.length < 10) {
    throw new Error('config.json: "jwtSecret" must be a string (min length 10)');
  }
  if (!value.smtp || typeof value.smtp !== 'object') {
    throw new Error('config.json: "smtp" config is required');
  }
  if (typeof value.smtp.host !== 'string' || typeof value.smtp.user !== 'string') {
    throw new Error('config.json: "smtp.host" and "smtp.user" must be strings');
  }
  if (typeof value.smtp.port !== 'number') {
    throw new Error('config.json: "smtp.port" must be a number');
  }
  if (typeof value.smtp.pass !== 'string' || typeof value.smtp.fromEmail !== 'string') {
    throw new Error('config.json: "smtp.pass" and "smtp.fromEmail" must be strings');
  }
  if (typeof value.googleClientId !== 'string' || !value.googleClientId) {
    throw new Error('config.json: "googleClientId" must be a non-empty string');
  }
}

export function getConfig(): AppConfig {
  const configPath = path.resolve(process.cwd(), 'config.json');
  const value = loadJsonFile(configPath);
  assertConfig(value);
  return value;
}


