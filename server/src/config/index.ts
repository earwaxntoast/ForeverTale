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
  port: parseInt(optional('PORT', '4000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  clientUrl: optional('CLIENT_URL', 'http://localhost:3000'),

  // Database
  databaseUrl: required('DATABASE_URL'),

  // Redis
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),

  // Firebase
  firebase: {
    projectId: required('FIREBASE_PROJECT_ID'),
    clientEmail: required('FIREBASE_CLIENT_EMAIL'),
    privateKey: required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  },

  // AI Providers
  ai: {
    anthropic: required('ANTHROPIC_API_KEY'),
    google: required('GOOGLE_AI_API_KEY'),
    grok: optional('GROK_API_KEY', ''),
    elevenlabs: optional('ELEVENLABS_API_KEY', ''),
  },

  // Stripe
  stripe: {
    secretKey: required('STRIPE_SECRET_KEY'),
    webhookSecret: required('STRIPE_WEBHOOK_SECRET'),
    prices: {
      basic: optional('STRIPE_PRICE_BASIC', ''),
      pro: optional('STRIPE_PRICE_PRO', ''),
      unlimited: optional('STRIPE_PRICE_UNLIMITED', ''),
    },
  },

  // GCP Storage
  gcp: {
    projectId: optional('GCP_PROJECT_ID', ''),
    storageBucket: optional('GCP_STORAGE_BUCKET', 'forevertale-media'),
  },
} as const;

export type Config = typeof config;
