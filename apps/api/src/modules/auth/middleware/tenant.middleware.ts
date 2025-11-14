import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../auth.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Try to get tenant from:
    // 1. Subdomain (e.g., demo.roofingcrm.com)
    // 2. X-Tenant-Slug header
    // 3. Query parameter

    let tenant = null;

    // Check header first
    const tenantSlug = req.headers['x-tenant-slug'] as string;
    if (tenantSlug) {
      tenant = await this.authService.getTenantBySlug(tenantSlug);
    }

    // Check query parameter
    if (!tenant) {
      const querySlug = req.query.tenant as string;
      if (querySlug) {
        tenant = await this.authService.getTenantBySlug(querySlug);
      }
    }

    // Check subdomain
    if (!tenant) {
      const host = req.headers.host;
      if (host) {
        const parts = host.split('.');
        if (parts.length > 2) {
          const subdomain = parts[0];
          tenant = await this.authService.getTenantBySlug(subdomain);
        }
      }
    }

    // For development, use default tenant if none found
    if (!tenant && process.env.NODE_ENV === 'development') {
      tenant = await this.authService.getTenantBySlug('demo');
    }

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Attach tenant to request
    (req as any).tenant = tenant;

    next();
  }
}
