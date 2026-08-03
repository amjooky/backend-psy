"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting database seed...');
    const BCRYPT_ROUNDS = 12;
    const adminPassword = await bcrypt.hash('Admin@Monpsy123!', BCRYPT_ROUNDS);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@monpsy.tn' },
        update: {},
        create: {
            email: 'admin@monpsy.tn',
            passwordHash: adminPassword,
            role: client_1.UserRole.SUPER_ADMIN,
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
    const patientPassword = await bcrypt.hash('Patient@123!', BCRYPT_ROUNDS);
    const patient = await prisma.user.upsert({
        where: { email: 'patient@monpsy.tn' },
        update: {},
        create: {
            email: 'patient@monpsy.tn',
            passwordHash: patientPassword,
            role: client_1.UserRole.PATIENT,
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
    const psyPassword = await bcrypt.hash('Psycho@123!', BCRYPT_ROUNDS);
    const psy = await prisma.user.upsert({
        where: { email: 'psy@monpsy.tn' },
        update: {},
        create: {
            email: 'psy@monpsy.tn',
            passwordHash: psyPassword,
            role: client_1.UserRole.PSYCHOLOGIST,
            isEmailVerified: true,
            isActive: true,
            psychologist: {
                create: {
                    firstName: 'Sonia',
                    lastName: 'Trabelsi',
                    biography: 'Psychologue clinicienne spécialisée en thérapie cognitive-comportementale avec 10 ans d\'expérience.',
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
//# sourceMappingURL=seed.js.map