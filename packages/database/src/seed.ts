import { PrismaClient, UserRole, LeadSource, LeadStatus, JobType, JobStatus } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create a demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Roofing Company',
      slug: 'demo',
      domain: 'demo.roofingcrm.com',
      settings: {
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        currency: 'USD',
        businessHours: {
          monday: { open: '08:00', close: '17:00', closed: false },
          tuesday: { open: '08:00', close: '17:00', closed: false },
          wednesday: { open: '08:00', close: '17:00', closed: false },
          thursday: { open: '08:00', close: '17:00', closed: false },
          friday: { open: '08:00', close: '17:00', closed: false },
          saturday: { open: '09:00', close: '13:00', closed: false },
          sunday: { open: '00:00', close: '00:00', closed: true },
        },
        features: {
          stormTracking: true,
          insuranceWorkflow: true,
          aiAssistant: true,
          mobileApp: true,
        },
      },
    },
  });

  console.log(`✅ Created tenant: ${tenant.name}`);

  // Create demo users
  const passwordHash = await bcrypt.hash('password123', 10);

  const owner = await prisma.user.upsert({
    where: { id: 'owner-seed-id' },
    update: {},
    create: {
      id: 'owner-seed-id',
      tenantId: tenant.id,
      email: 'owner@demo.com',
      passwordHash,
      firstName: 'John',
      lastName: 'Owner',
      phone: '555-0100',
      role: UserRole.OWNER,
      emailVerified: true,
    },
  });

  const salesManager = await prisma.user.upsert({
    where: { id: 'sales-manager-seed-id' },
    update: {},
    create: {
      id: 'sales-manager-seed-id',
      tenantId: tenant.id,
      email: 'sales@demo.com',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Sales',
      phone: '555-0101',
      role: UserRole.SALES_MANAGER,
      emailVerified: true,
    },
  });

  const salesRep = await prisma.user.upsert({
    where: { id: 'sales-rep-seed-id' },
    update: {},
    create: {
      id: 'sales-rep-seed-id',
      tenantId: tenant.id,
      email: 'rep@demo.com',
      passwordHash,
      firstName: 'Mike',
      lastName: 'Rep',
      phone: '555-0102',
      role: UserRole.SALES_REP,
      emailVerified: true,
    },
  });

  const productionManager = await prisma.user.upsert({
    where: { id: 'production-manager-seed-id' },
    update: {},
    create: {
      id: 'production-manager-seed-id',
      tenantId: tenant.id,
      email: 'production@demo.com',
      passwordHash,
      firstName: 'Paul',
      lastName: 'Production',
      phone: '555-0103',
      role: UserRole.PRODUCTION_MANAGER,
      emailVerified: true,
    },
  });

  console.log(`✅ Created ${4} demo users (password: password123)`);

  // Create demo contacts
  const contacts = [];
  for (let i = 0; i < 10; i++) {
    const contact = await prisma.contact.create({
      data: {
        tenantId: tenant.id,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        phone: faker.phone.number('###-###-####'),
        address: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state({ abbreviated: true }),
          zip: faker.location.zipCode(),
          country: 'US',
        },
        preferredContact: faker.helpers.arrayElement(['EMAIL', 'PHONE', 'TEXT']),
        tags: faker.helpers.arrayElements(['VIP', 'Referral', 'Repeat Customer'], 0, 2),
      },
    });
    contacts.push(contact);
  }

  console.log(`✅ Created ${contacts.length} demo contacts`);

  // Create demo properties
  const properties = [];
  for (const contact of contacts) {
    const property = await prisma.property.create({
      data: {
        tenantId: tenant.id,
        address: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state({ abbreviated: true }),
          zip: faker.location.zipCode(),
          country: 'US',
        },
        roofType: faker.helpers.arrayElement([
          'ASPHALT_SHINGLE',
          'METAL',
          'TILE',
          'FLAT',
        ]),
        pitch: faker.helpers.arrayElement(['4/12', '6/12', '8/12', '10/12']),
        squares: faker.number.int({ min: 15, max: 50 }),
        layers: faker.number.int({ min: 1, max: 3 }),
        age: faker.number.int({ min: 5, max: 30 }),
        condition: faker.helpers.arrayElement(['EXCELLENT', 'GOOD', 'FAIR', 'POOR']),
      },
    });
    properties.push(property);
  }

  console.log(`✅ Created ${properties.length} demo properties`);

  // Create demo leads
  const leads = [];
  for (let i = 0; i < 15; i++) {
    const contact = faker.helpers.arrayElement(contacts);
    const property = faker.helpers.arrayElement(properties);

    const lead = await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        source: faker.helpers.arrayElement(Object.values(LeadSource)),
        status: faker.helpers.arrayElement([
          LeadStatus.NEW,
          LeadStatus.CONTACTED,
          LeadStatus.QUALIFIED,
        ]),
        score: faker.number.int({ min: 30, max: 95 }),
        contactId: contact.id,
        propertyId: property.id,
        assignedToId: faker.helpers.arrayElement([salesRep.id, salesManager.id]),
        urgency: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
        tags: faker.helpers.arrayElements(['Storm', 'Insurance', 'Referral'], 0, 2),
      },
    });
    leads.push(lead);
  }

  console.log(`✅ Created ${leads.length} demo leads`);

  // Create demo jobs
  const jobs = [];
  for (let i = 0; i < 8; i++) {
    const contact = faker.helpers.arrayElement(contacts);
    const property = faker.helpers.arrayElement(properties);

    const job = await prisma.job.create({
      data: {
        tenantId: tenant.id,
        jobNumber: `JOB-${String(i + 1).padStart(5, '0')}`,
        type: faker.helpers.arrayElement(Object.values(JobType)),
        status: faker.helpers.arrayElement([
          JobStatus.QUALIFIED,
          JobStatus.ESTIMATED,
          JobStatus.PROPOSED,
          JobStatus.SOLD,
          JobStatus.IN_PRODUCTION,
        ]),
        contactId: contact.id,
        propertyId: property.id,
        assignedToId: faker.helpers.arrayElement([salesRep.id, salesManager.id]),
        value: faker.number.int({ min: 5000, max: 25000 }),
        tags: faker.helpers.arrayElements(['Priority', 'Insurance', 'Warranty'], 0, 2),
      },
    });
    jobs.push(job);
  }

  console.log(`✅ Created ${jobs.length} demo jobs`);

  // Create demo tasks
  for (let i = 0; i < 20; i++) {
    await prisma.task.create({
      data: {
        tenantId: tenant.id,
        title: faker.helpers.arrayElement([
          'Follow up with customer',
          'Schedule inspection',
          'Send proposal',
          'Order materials',
          'Schedule installation',
          'Collect payment',
          'Request review',
        ]),
        description: faker.lorem.sentence(),
        status: faker.helpers.arrayElement(['TODO', 'IN_PROGRESS', 'COMPLETED']),
        priority: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
        assignedToId: faker.helpers.arrayElement([
          owner.id,
          salesManager.id,
          salesRep.id,
          productionManager.id,
        ]),
        relatedToType: faker.helpers.arrayElement(['LEAD', 'JOB']),
        relatedToId: faker.helpers.arrayElement([
          ...leads.map((l) => l.id),
          ...jobs.map((j) => j.id),
        ]),
        dueDate: faker.date.future(),
      },
    });
  }

  console.log(`✅ Created 20 demo tasks`);

  // Create demo crew
  const crew = await prisma.crew.create({
    data: {
      tenantId: tenant.id,
      name: 'Crew Alpha',
    },
  });

  console.log(`✅ Created demo crew`);

  console.log('🎉 Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
