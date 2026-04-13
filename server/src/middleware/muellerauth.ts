// Central auth middleware — validates the browser's muellerauth_sid cookie
// against auth.themuellerhouse.com/session, upserts a local User on first
// encounter, and attaches { user } to the request. Routes that need auth
// call `requireUser(req, res)` early.

import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

const prisma = new PrismaClient();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        displayName: string | null;
        isAdmin: boolean;
        apps: string[];
      };
    }
  }
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx) === name) return part.slice(idx + 1);
  }
  return null;
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const sid = parseCookie(req.headers.cookie, 'muellerauth_sid');
  if (!sid) return next();

  try {
    const sessionRes = await fetch(`${config.muellerauth.url}/session`, {
      headers: { cookie: `muellerauth_sid=${sid}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cache: 'no-store' as any,
    });
    if (!sessionRes.ok) return next();
    const authUser = (await sessionRes.json()) as {
      email: string;
      name: string;
      isAdmin: boolean;
      apps: string[];
    };
    if (!authUser.apps?.includes(config.muellerauth.appSlug)) return next();

    const local = await prisma.user.upsert({
      where: { email: authUser.email.toLowerCase() },
      update: { displayName: authUser.name || undefined },
      create: {
        email: authUser.email.toLowerCase(),
        displayName: authUser.name || authUser.email,
      },
    });

    req.user = {
      id: local.id,
      email: local.email,
      displayName: local.displayName,
      isAdmin: authUser.isAdmin,
      apps: authUser.apps,
    };
  } catch {
    // Auth service unreachable — treat as unauthenticated, don't block public endpoints.
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    const returnTo = `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}${req.originalUrl}`;
    return res.status(401).json({
      error: 'unauthenticated',
      loginUrl: `${config.muellerauth.url}/login?redirect=${encodeURIComponent(returnTo)}`,
    });
  }
  next();
}
