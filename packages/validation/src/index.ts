import { z } from 'zod';
import { UserRole, LeadSource, LeadStatus, JobStatus, JobType } from '@roofing-crm/shared-types';

// User validation schemas
export const userRoleSchema = z.nativeEnum(UserRole);

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
  role: userRoleSchema,
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Tenant validation schemas
export const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  domain: z.string().optional(),
});

// Address validation schema
export const addressSchema = z.object({
  street: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  country: z.string().default('US'),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

// Lead validation schemas
export const createLeadSchema = z.object({
  source: z.nativeEnum(LeadSource),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: addressSchema.optional(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).default({}),
});

export const updateLeadSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  score: z.number().min(0).max(100).optional(),
  assignedToId: z.string().uuid().optional(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
});

// Contact validation schemas
export const createContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  alternatePhone: z.string().optional(),
  address: addressSchema.optional(),
  preferredContact: z.enum(['EMAIL', 'PHONE', 'TEXT']).default('EMAIL'),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const updateContactSchema = createContactSchema.partial();

// Property validation schemas
export const createPropertySchema = z.object({
  address: addressSchema,
  roofType: z.string().optional(),
  pitch: z.string().optional(),
  squares: z.number().positive().optional(),
  layers: z.number().int().positive().optional(),
  age: z.number().int().positive().optional(),
  condition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR']).optional(),
});

export const updatePropertySchema = createPropertySchema.partial();

// Job validation schemas
export const createJobSchema = z.object({
  type: z.nativeEnum(JobType),
  contactId: z.string().uuid(),
  propertyId: z.string().uuid(),
  assignedToId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  scheduledStartDate: z.string().datetime().optional(),
  scheduledEndDate: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).default({}),
});

export const updateJobSchema = z.object({
  status: z.nativeEnum(JobStatus).optional(),
  assignedToId: z.string().uuid().optional(),
  scheduledStartDate: z.string().datetime().optional(),
  scheduledEndDate: z.string().datetime().optional(),
  actualStartDate: z.string().datetime().optional(),
  actualEndDate: z.string().datetime().optional(),
  value: z.number().positive().optional(),
  cost: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
});

// Task validation schemas
export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  assignedToId: z.string().uuid().optional(),
  relatedToType: z.enum(['LEAD', 'JOB', 'CONTACT', 'PROPERTY']).optional(),
  relatedToId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

// Note validation schemas
export const createNoteSchema = z.object({
  content: z.string().min(1),
  relatedToType: z.enum(['LEAD', 'JOB', 'CONTACT', 'PROPERTY']),
  relatedToId: z.string().uuid(),
  isPinned: z.boolean().default(false),
});

export const updateNoteSchema = z.object({
  content: z.string().min(1).optional(),
  isPinned: z.boolean().optional(),
});

// Query validation schemas
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export const searchSchema = z.object({
  q: z.string().min(1).optional(),
  ...paginationSchema.shape,
});

// Export all schemas
export * from './schemas';
