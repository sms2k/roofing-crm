// User & Authentication Types
export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  SALES_MANAGER = 'SALES_MANAGER',
  SALES_REP = 'SALES_REP',
  ESTIMATOR = 'ESTIMATOR',
  PRODUCTION_MANAGER = 'PRODUCTION_MANAGER',
  CREW_LEADER = 'CREW_LEADER',
  CREW_MEMBER = 'CREW_MEMBER',
  OFFICE_MANAGER = 'OFFICE_MANAGER',
  BOOKKEEPER = 'BOOKKEEPER',
  SUBCONTRACTOR = 'SUBCONTRACTOR',
  CUSTOMER = 'CUSTOMER',
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  tenantId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  logo?: string;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  timezone: string;
  dateFormat: string;
  currency: string;
  businessHours: BusinessHours;
  features: {
    stormTracking: boolean;
    insuranceWorkflow: boolean;
    aiAssistant: boolean;
    mobileApp: boolean;
  };
}

export interface BusinessHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface DaySchedule {
  open: string; // HH:mm
  close: string; // HH:mm
  closed: boolean;
}

// Lead Types
export enum LeadSource {
  STORM = 'STORM',
  REFERRAL = 'REFERRAL',
  MARKETING = 'MARKETING',
  CANVASSING = 'CANVASSING',
  WEBSITE = 'WEBSITE',
  PHONE = 'PHONE',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  HOME_ADVISOR = 'HOME_ADVISOR',
  OTHER = 'OTHER',
}

export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  UNQUALIFIED = 'UNQUALIFIED',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST',
}

export interface Lead {
  id: string;
  tenantId: string;
  source: LeadSource;
  status: LeadStatus;
  score: number; // 0-100, AI-calculated
  contactId?: string;
  propertyId?: string;
  assignedToId?: string;
  stormEventId?: string;
  insuranceInfo?: InsuranceInfo;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  tags: string[];
  customFields: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsuranceInfo {
  carrier?: string;
  policyNumber?: string;
  claimNumber?: string;
  adjusterName?: string;
  adjusterPhone?: string;
  adjusterEmail?: string;
}

// Contact Types
export interface Contact {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  address?: Address;
  preferredContact: 'EMAIL' | 'PHONE' | 'TEXT';
  tags: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Address {
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  lat?: number;
  lng?: number;
}

// Property Types
export enum RoofType {
  ASPHALT_SHINGLE = 'ASPHALT_SHINGLE',
  METAL = 'METAL',
  TILE = 'TILE',
  SLATE = 'SLATE',
  FLAT = 'FLAT',
  TPO = 'TPO',
  EPDM = 'EPDM',
  OTHER = 'OTHER',
}

export interface Property {
  id: string;
  tenantId: string;
  address: Address;
  roofType?: RoofType;
  pitch?: string;
  squares?: number;
  layers?: number;
  age?: number;
  condition?: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  hoaInfo?: HOAInfo;
  permitInfo?: PermitInfo;
  photos: PropertyPhoto[];
  measurements?: RoofMeasurement;
  createdAt: Date;
  updatedAt: Date;
}

export interface HOAInfo {
  name: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  requiresApproval: boolean;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'DENIED';
}

export interface PermitInfo {
  required: boolean;
  jurisdiction?: string;
  permitNumber?: string;
  status?: 'NOT_FILED' | 'PENDING' | 'APPROVED' | 'DENIED';
  cost?: number;
}

export interface PropertyPhoto {
  id: string;
  url: string;
  thumbnailUrl?: string;
  category: 'DAMAGE' | 'GENERAL' | 'BEFORE' | 'DURING' | 'AFTER';
  tags: string[];
  aiTags?: string[];
  capturedAt: Date;
  uploadedBy: string;
}

export interface RoofMeasurement {
  source: 'EAGLEVIEW' | 'HOVER' | 'MANUAL' | 'DRONE';
  totalSquares: number;
  facets: RoofFacet[];
  reportUrl?: string;
  measuredAt: Date;
}

export interface RoofFacet {
  area: number;
  pitch: string;
  ridgeLength?: number;
  valleyLength?: number;
  rakeLength?: number;
  eaveLength?: number;
}

// Job Types
export enum JobStatus {
  LEAD = 'LEAD',
  QUALIFIED = 'QUALIFIED',
  INSPECTED = 'INSPECTED',
  ESTIMATED = 'ESTIMATED',
  PROPOSED = 'PROPOSED',
  NEGOTIATING = 'NEGOTIATING',
  SOLD = 'SOLD',
  SCHEDULED = 'SCHEDULED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  COMPLETED = 'COMPLETED',
  INVOICED = 'INVOICED',
  PAID = 'PAID',
  CLOSED = 'CLOSED',
  LOST = 'LOST',
  CANCELLED = 'CANCELLED',
}

export enum JobType {
  RESIDENTIAL_REROOF = 'RESIDENTIAL_REROOF',
  RESIDENTIAL_REPAIR = 'RESIDENTIAL_REPAIR',
  COMMERCIAL_REROOF = 'COMMERCIAL_REROOF',
  COMMERCIAL_REPAIR = 'COMMERCIAL_REPAIR',
  INSURANCE_CLAIM = 'INSURANCE_CLAIM',
  MAINTENANCE = 'MAINTENANCE',
  WARRANTY = 'WARRANTY',
  INSPECTION = 'INSPECTION',
}

export interface Job {
  id: string;
  tenantId: string;
  jobNumber: string;
  type: JobType;
  status: JobStatus;
  contactId: string;
  propertyId: string;
  assignedToId?: string;
  leadId?: string;
  insuranceInfo?: InsuranceInfo;
  estimateId?: string;
  contractId?: string;
  scheduledStartDate?: Date;
  scheduledEndDate?: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  value?: number;
  cost?: number;
  margin?: number;
  tags: string[];
  customFields: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: Required<ResponseMeta>;
}

// Filter & Query Types
export interface QueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startsWith';
  value: any;
}

export interface QuerySort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryParams {
  page?: number;
  limit?: number;
  filters?: QueryFilter[];
  sort?: QuerySort[];
  search?: string;
}

// AI Types
export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  functionCall?: AIFunctionCall;
}

export interface AIFunctionCall {
  name: string;
  arguments: Record<string, any>;
}

export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

// Audit Types
export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
}

// Notification Types
export enum NotificationType {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  read: boolean;
  createdAt: Date;
}

// Task Types
export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export interface Task {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToId?: string;
  relatedToType?: 'LEAD' | 'JOB' | 'CONTACT' | 'PROPERTY';
  relatedToId?: string;
  dueDate?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Note Types
export interface Note {
  id: string;
  tenantId: string;
  content: string;
  relatedToType: 'LEAD' | 'JOB' | 'CONTACT' | 'PROPERTY';
  relatedToId: string;
  createdBy: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Export all types
export * from './types';
