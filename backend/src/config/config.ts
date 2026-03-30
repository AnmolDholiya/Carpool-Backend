import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

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
  supabaseUrl: string;
  supabaseKey: string;
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
  if (typeof value.supabaseUrl !== 'string' || !value.supabaseUrl) {
    throw new Error('config.json: "supabaseUrl" must be a non-empty string');
  }
  if (typeof value.supabaseKey !== 'string' || !value.supabaseKey) {
    throw new Error('config.json: "supabaseKey" must be a non-empty string');
  }
}

export function getConfig(): AppConfig {
  const config: any = {
    port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      fromEmail: process.env.SMTP_FROM_EMAIL || '',
    },
  };

  // If any critical production config is missing, try loading from config.json for local development
  if (!config.supabaseUrl || !config.databaseUrl) {
    const configPath = path.resolve(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const jsonValue = loadJsonFile(configPath) as AppConfig;
        // Merge JSON into config, preferring environment variables if they exist
        config.port = config.port ?? jsonValue.port;
        config.databaseUrl = config.databaseUrl ?? jsonValue.databaseUrl;
        config.jwtSecret = config.jwtSecret ?? jsonValue.jwtSecret;
        config.googleClientId = config.googleClientId ?? jsonValue.googleClientId;
        config.supabaseUrl = config.supabaseUrl ?? jsonValue.supabaseUrl;
        config.supabaseKey = config.supabaseKey ?? jsonValue.supabaseKey;
        if (jsonValue.smtp) {
          config.smtp = {
            host: process.env.SMTP_HOST ?? jsonValue.smtp.host,
            port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : jsonValue.smtp.port,
            user: process.env.SMTP_USER ?? jsonValue.smtp.user,
            pass: process.env.SMTP_PASS ?? jsonValue.smtp.pass,
            fromEmail: process.env.SMTP_FROM_EMAIL ?? jsonValue.smtp.fromEmail,
          };
        }
      } catch (e) {
        console.warn('Failed to load config.json, relying on environment variables.');
      }
    }
  }

  assertConfig(config);
  return config as AppConfig;
}


