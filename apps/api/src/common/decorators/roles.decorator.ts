import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@roofing-crm/shared-types';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
