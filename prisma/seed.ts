import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  const BCRYPT_ROUNDS = 12;

  // ─── Create Super Admin ──────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@Monpsy123!', BCRYPT_ROUNDS);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@monpsy.tn' },
    update: {},
    create: {
      email: 'admin@monpsy.tn',
      passwordHash: adminPassword,
      role: UserRole.SUPER_ADMIN,
      isEmailVerified: true,
      isActive: true,
      admin: {
        create: {
          firstName: 'Super',
          lastName: 'Admin',
          permissions: ['*'],
        },
      },
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  // ─── Create Demo Patient ─────────────────────────────────────
  const patientPassword = await bcrypt.hash('Patient@123!', BCRYPT_ROUNDS);
  const patient = await prisma.user.upsert({
    where: { email: 'patient@monpsy.tn' },
    update: {},
    create: {
      email: 'patient@monpsy.tn',
      passwordHash: patientPassword,
      role: UserRole.PATIENT,
      isEmailVerified: true,
      isActive: true,
      patient: {
        create: {
          firstName: 'Amine',
          lastName: 'Ben Ali',
          timezone: 'Africa/Tunis',
          preferredLanguage: 'fr',
        },
      },
    },
  });
  console.log(`✅ Demo patient created: ${patient.email}`);

  // ─── Create Demo Psychologist ─────────────────────────────────
  const psyPassword = await bcrypt.hash('Psycho@123!', BCRYPT_ROUNDS);
  const psy = await prisma.user.upsert({
    where: { email: 'psy@monpsy.tn' },
    update: {},
    create: {
      email: 'psy@monpsy.tn',
      passwordHash: psyPassword,
      role: UserRole.PSYCHOLOGIST,
      isEmailVerified: true,
      isActive: true,
      psychologist: {
        create: {
          firstName: 'Sonia',
          lastName: 'Trabelsi',
          biography:
            'Psychologue clinicienne spécialisée en thérapie cognitive-comportementale avec 10 ans d\'expérience.',
          licenseNumber: 'LIC-2024-001',
          yearsOfExperience: 10,
          sessionFormats: ['VIDEO', 'AUDIO'],
          languages: ['fr', 'ar'],
          timezone: 'Africa/Tunis',
          pricePerSession: 80,
          currency: 'TND',
          sessionDurationMins: 60,
          status: 'ACTIVE',
          isProfileComplete: true,
          specialties: {
            createMany: {
              data: [
                { specialty: 'Anxiety' },
                { specialty: 'Depression' },
                { specialty: 'Cognitive Behavioral Therapy' },
              ],
            },
          },
          availabilitySlots: {
            createMany: {
              data: [
                { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' },
                { dayOfWeek: 'TUESDAY', startTime: '09:00', endTime: '17:00' },
                { dayOfWeek: 'WEDNESDAY', startTime: '09:00', endTime: '12:00' },
                { dayOfWeek: 'THURSDAY', startTime: '09:00', endTime: '17:00' },
                { dayOfWeek: 'FRIDAY', startTime: '09:00', endTime: '16:00' },
              ],
            },
          },
        },
      },
    },
  });
  console.log(`✅ Demo psychologist created: ${psy.email}`);

  console.log('\n🎉 Seed completed successfully!\n');
  console.log('Demo Credentials:');
  console.log('  Admin:        admin@monpsy.tn     / Admin@Monpsy123!');
  console.log('  Patient:      patient@monpsy.tn   / Patient@123!');
  console.log('  Psychologist: psy@monpsy.tn       / Psycho@123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
