import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  // Server
  port: parseInt(optional('PORT', '3003'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  clientUrl: optional('CLIENT_URL', 'https://forevertale.themuellerhouse.com'),

  // Database
  databaseUrl: required('DATABASE_URL'),

  // Redis (optional — workers degrade to best-effort inline if missing)
  redisUrl: optional('REDIS_URL', ''),

  // Central auth service
  muellerauth: {
    url: optional('MUELLERAUTH_URL', 'https://auth.themuellerhouse.com'),
    appSlug: optional('MUELLERAUTH_APP_SLUG', 'forevertale'),
  },

  // AI Providers (all optional — only routes that invoke them require them)
  ai: {
    anthropic: optional('ANTHROPIC_API_KEY', ''),
    google: optional('GOOGLE_AI_API_KEY', ''),
    grok: optional('GROK_API_KEY', ''),
    elevenlabs: optional('ELEVENLABS_API_KEY', ''),
  },

  // GCP Storage (optional)
  gcp: {
    projectId: optional('GCP_PROJECT_ID', ''),
    storageBucket: optional('GCP_STORAGE_BUCKET', ''),
  },
} as const;

export type Config = typeof config;
