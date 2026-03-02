import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

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
  resendApiKey: string;
};

function loadJsonFile(filePath: string): unknown {
  try {
    let raw = fs.readFileSync(filePath, 'utf8');
    // Strip UTF-8 BOM or other leading whitespace that can break JSON.parse
    raw = raw.replace(/^\uFEFF/, '').trimStart();
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function assertConfig(value: any): asserts value is AppConfig {
  if (!value || typeof value !== 'object') throw new Error('Configuration is missing or invalid');
  if (typeof value.port !== 'number') throw new Error('config: "port" must be a number');
  if (typeof value.databaseUrl !== 'string' || !value.databaseUrl) {
    throw new Error('config: "databaseUrl" must be a non-empty string');
  }
  if (typeof value.jwtSecret !== 'string' || value.jwtSecret.length < 10) {
    throw new Error('config: "jwtSecret" must be a string (min length 10)');
  }
  if (!value.smtp || typeof value.smtp !== 'object') {
    throw new Error('config: "smtp" config is required');
  }
  if (typeof value.smtp.host !== 'string' || typeof value.smtp.user !== 'string') {
    throw new Error('config: "smtp.host" and "smtp.user" must be strings');
  }
  if (typeof value.smtp.port !== 'number') {
    throw new Error('config: "smtp.port" must be a number');
  }
  if (typeof value.smtp.pass !== 'string' || typeof value.smtp.fromEmail !== 'string') {
    throw new Error('config: "smtp.pass" and "smtp.fromEmail" must be strings');
  }
  if (typeof value.googleClientId !== 'string' || !value.googleClientId) {
    throw new Error('config: "googleClientId" must be a non-empty string');
  }
  if (typeof value.resendApiKey !== 'string' || !value.resendApiKey) {
    throw new Error('config: "resendApiKey" must be a non-empty string');
  }
}

export function getConfig(): AppConfig {
  // Try environment variables first
  const envConfig: Partial<AppConfig> = {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 4000,
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 0,
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      fromEmail: process.env.SMTP_FROM_EMAIL || '',
    },
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
  };

  // If critical env vars are present, use them
  if (envConfig.databaseUrl && envConfig.jwtSecret && envConfig.googleClientId && envConfig.resendApiKey) {
    const fullConfig = {
      port: envConfig.port || 4000,
      databaseUrl: envConfig.databaseUrl,
      jwtSecret: envConfig.jwtSecret,
      smtp: envConfig.smtp as SmtpConfig,
      googleClientId: envConfig.googleClientId,
      resendApiKey: envConfig.resendApiKey,
    };
    try {
      assertConfig(fullConfig);
      return fullConfig;
    } catch (e: any) {
      throw new Error(`Configuration validation failed: ${e.message}`);
    }
  }

  // Fallback to config.json
  const configPath = path.resolve(process.cwd(), 'config.json');
  if (fs.existsSync(configPath)) {
    const value = loadJsonFile(configPath);
    if (value) {
      assertConfig(value);
      return value;
    }
  }

  // If we reach here, neither valid env vars nor a valid config.json exist.
  // We list what's missing to help debugging.
  const missing = [];
  if (!envConfig.databaseUrl) missing.push('DATABASE_URL');
  if (!envConfig.jwtSecret) missing.push('JWT_SECRET');
  if (!envConfig.googleClientId) missing.push('GOOGLE_CLIENT_ID');
  if (!envConfig.resendApiKey) missing.push('RESEND_API_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  throw new Error('Configuration not found. Please provide environment variables or a config.json file.');
}


