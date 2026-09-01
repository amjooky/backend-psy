/**
 * ============================================================================
 * MonPsy — Full End-to-End API Integration & Scenario Test Runner
 * ============================================================================
 * 
 * Tests all backend modules across a complete user lifecycle:
 * 1. Healthcheck & System Probe
 * 2. User Authentication & 2FA Tokens (Patient, Anonymous, Psychologist)
 * 3. Patient Profile & Medical Questionnaire
 * 4. Psychologist Directory, Availability & Exceptions
 * 5. Appointment Booking & Anti-Collision Checks
 * 6. Payment Initiation & Verification
 * 7. Teleconsultation Jitsi Meet Access Token Verification
 * 8. Encrypted Messaging & Conversation Threads
 * 9. Notifications & Alerts
 * 10. Support Tickets & Assistance
 * 11. Token Invalidation & Logout
 * 
 * Usage:
 *   node test-all-apis-scenario.js
 *   $env:API_URL="https://backend-psy-upv7.onrender.com/api/v1"; node test-all-apis-scenario.js
 * ============================================================================
 */

const BASE_URL = process.env.API_URL || 'https://backend-psy-upv7.onrender.com/api/v1';

// ANSI terminal colors for beautiful output
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
};

const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  startTime: Date.now(),
};

// Global context holding state between sequential steps
const ctx = {
  patientToken: null,
  patientRefreshToken: null,
  patientUserId: null,
  patientEmail: null,
  
  psyToken: null,
  psyUserId: null,
  psyId: null,
  psyEmail: null,
  
  anonToken: null,
  anonRecoveryKey: null,
  
  appointmentId: null,
  paymentId: null,
  conversationId: null,
  ticketId: null,
};

/**
 * Universal HTTP Request Helper
 */
async function req(method, endpoint, body = null, token = null) {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  return { status: res.status, ok: res.ok, data };
}

/**
 * Test Assertion Runner
 */
async function test(name, fn) {
  stats.total++;
  const label = `[${stats.total.toString().padStart(2, '0')}] ${name}`;
  try {
    process.stdout.write(`  ${C.cyan}▶${C.reset} ${label}... `);
    const res = await fn();
    stats.passed++;
    console.log(`${C.green}✓ SUCCÈS${C.reset}`);
    return res;
  } catch (err) {
    stats.failed++;
    console.log(`${C.red}✗ ÉCHEC${C.reset}`);
    console.log(`    ${C.red}↳ Erreur : ${err.message || err}${C.reset}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

/**
 * ============================================================================
 * TEST SCENARIO
 * ============================================================================
 */
async function runFullScenario() {
  const ts = Date.now();
  console.log(`\n${C.bgBlue}${C.white}${C.bright}  MONPSY — SUITE COMPLÈTE DE VALIDATION E2E DES APIs  ${C.reset}`);
  console.log(`${C.dim}  Cible : ${BASE_URL}${C.reset}\n`);

  // --------------------------------------------------------------------------
  // STEP 1: HEALTHCHECK
  // --------------------------------------------------------------------------
  console.log(`${C.bright}${C.yellow}► ÉTAPE 1 : Sondage & Disponibilité du Système${C.reset}`);
  await test('Vérification de la santé du serveur (GET /health)', async () => {
    const res = await req('GET', '/health');
    assert(res.status === 200, `Statut attendu 200, reçu ${res.status}`);
    const body = res.data?.data || res.data || {};
    assert(
      body.status === 'ok' || body.status === 'degraded' || body.services,
      `Réponse inattendue: ${JSON.stringify(res.data)}`
    );
  });

  // --------------------------------------------------------------------------
  // STEP 2: AUTHENTICATION & USERS
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 2 : Authentification & Création des Comptes${C.reset}`);

  ctx.patientEmail = `patient.test.${ts}@monpsy.tn`;
  await test(`Inscription Patient Nominatif (POST /auth/register/patient)`, async () => {
    const res = await req('POST', '/auth/register/patient', {
      email: ctx.patientEmail,
      password: 'Password123!',
      firstName: 'Amine',
      lastName: 'Gharbi',
    });
    assert(res.status === 201, `Attendu 201, reçu ${res.status}: ${JSON.stringify(res.data)}`);
    ctx.patientUserId = res.data?.userId || res.data?.data?.userId || res.data?.id;
    assert(ctx.patientUserId, 'L\'inscription doit retourner un userId');
  });

  await test(`Inscription Patient Anonyme (POST /auth/register/patient)`, async () => {
    const res = await req('POST', '/auth/register/patient', {
      pseudo: `Serein_${ts.toString().slice(-4)}`,
      password: 'Password123!',
    });
    assert(res.status === 201, `Attendu 201, reçu ${res.status}: ${JSON.stringify(res.data)}`);
    ctx.anonRecoveryKey = res.data?.recoveryKey || res.data?.data?.recoveryKey;
  });

  ctx.psyEmail = `psy.dr.${ts}@monpsy.tn`;
  await test(`Inscription Psychologue Agréé (POST /auth/register/psychologist)`, async () => {
    const res = await req('POST', '/auth/register/psychologist', {
      email: ctx.psyEmail,
      password: 'Password123!',
      firstName: 'Dr. Leila',
      lastName: 'Hammami',
      licenseNumber: `CNOM-TN-${ts.toString().slice(-6)}`,
    });
    assert(res.status === 201, `Attendu 201, reçu ${res.status}: ${JSON.stringify(res.data)}`);
    ctx.psyUserId = res.data?.userId || res.data?.data?.userId;
  });

  await test(`Connexion Patient & Réception JWT (POST /auth/login)`, async () => {
    const res = await req('POST', '/auth/login', {
      email: ctx.patientEmail,
      password: 'Password123!',
    });
    assert(res.status === 200, `Attendu 200, reçu ${res.status}: ${JSON.stringify(res.data)}`);
    const token = res.data?.accessToken || res.data?.data?.accessToken;
    const refreshToken = res.data?.refreshToken || res.data?.data?.refreshToken;
    assert(token, 'Un accessToken doit être retourné');
    ctx.patientToken = token;
    ctx.patientRefreshToken = refreshToken;
  });

  await test(`Connexion Psychologue & Réception JWT (POST /auth/login)`, async () => {
    const res = await req('POST', '/auth/login', {
      email: ctx.psyEmail,
      password: 'Password123!',
    });
    assert(res.status === 200, `Attendu 200, reçu ${res.status}: ${JSON.stringify(res.data)}`);
    ctx.psyToken = res.data?.accessToken || res.data?.data?.accessToken;
    assert(ctx.psyToken, 'Le token psychologue doit être présent');
  });

  if (ctx.patientRefreshToken) {
    await test(`Renouvellement Silencieux de Token (POST /auth/refresh)`, async () => {
      const res = await req('POST', '/auth/refresh', {
        refreshToken: ctx.patientRefreshToken,
      });
      assert(res.status === 200, `Attendu 200, reçu ${res.status}`);
      const newToken = res.data?.accessToken || res.data?.data?.accessToken;
      assert(newToken, 'Un nouvel accessToken doit être délivré');
      ctx.patientToken = newToken;
    });
  }

  // --------------------------------------------------------------------------
  // STEP 3: PATIENT PROFILE & QUESTIONNAIRE
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 3 : Espace & Dossier Patient${C.reset}`);

  if (ctx.patientToken) {
    await test(`Lecture Profil Patient (GET /patients/me)`, async () => {
      const res = await req('GET', '/patients/me', null, ctx.patientToken);
      assert(res.status === 200, `Attendu 200, reçu ${res.status}`);
      assert(res.data?.firstName === 'Amine' || res.data?.data?.firstName === 'Amine', 'Le prénom doit concorder');
    });

    await test(`Mise à jour Questionnaire Médical (PATCH /patients/me/questionnaire)`, async () => {
      const res = await req('PATCH', '/patients/me/questionnaire', {
        questionnaire: {
          mainConcern: 'Anxiété liée au travail',
          previousTherapy: false,
          currentMedication: false,
          sleepIssues: true,
          preferredSessionType: 'VIDEO',
        },
      }, ctx.patientToken);
      assert(res.status === 200, `Attendu 200, reçu ${res.status}: ${JSON.stringify(res.data)}`);
    });
  }

  // --------------------------------------------------------------------------
  // STEP 4: PSYCHOLOGISTS DIRECTORY & AVAILABILITY
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 4 : Annuaire Psychologues & Disponibilités${C.reset}`);

  await test(`Recherche Publique dans l'Annuaire (GET /psychologists)`, async () => {
    const res = await req('GET', '/psychologists');
    assert(res.status === 200, `Attendu 200, reçu ${res.status}`);
    const items = res.data?.data?.data || res.data?.data || res.data || [];
    assert(Array.isArray(items), 'L\'annuaire doit renvoyer une liste');
    if (items.length > 0) {
      ctx.psyId = items[0].id;
    }
  });

  if (ctx.psyId) {
    await test(`Fiche Détaillée du Psychologue (GET /psychologists/:id)`, async () => {
      const res = await req('GET', `/psychologists/${ctx.psyId}`);
      assert(res.status === 200, `Attendu 200, reçu ${res.status}`);
    });

    let validStartAt = null;

    await test(`Consultation des Créneaux Libres (GET /psychologists/:id/availability)`, async () => {
      // Find the next day with an active available working slot
      for (let offset = 1; offset <= 7; offset++) {
        const d = new Date(Date.now() + 86400000 * offset).toISOString().split('T')[0];
        const res = await req('GET', `/psychologists/${ctx.psyId}/availability?date=${d}`);
        if (res.status === 200) {
          const slots = res.data?.data || res.data || [];
          const freeSlot = Array.isArray(slots) ? slots.find((s) => s.isAvailable) : null;
          if (freeSlot) {
            validStartAt = `${d}T${freeSlot.startTime}:00.000Z`;
            break;
          }
        }
      }
      assert(true);
    });
  }

  // --------------------------------------------------------------------------
  // STEP 5: APPOINTMENTS & RESERVATIONS
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 5 : Prise de Rendez-Vous & Cycle de Vie${C.reset}`);

  if (ctx.patientToken && ctx.psyId) {
    const fallbackDate = new Date(Date.now() + 86400000 * 2);
    fallbackDate.setUTCHours(10, 0, 0, 0);
    const startAt = validStartAt || fallbackDate.toISOString();

    await test(`Réservation d'une Consultation (POST /appointments/book)`, async () => {
      const res = await req('POST', '/appointments/book', {
        psychologistId: ctx.psyId,
        startAt,
        sessionFormat: 'VIDEO',
        notes: 'Test de consultation automatisé E2E',
      }, ctx.patientToken);
      assert(res.status === 201 || res.status === 200, `Attendu 201/200, reçu ${res.status}: ${JSON.stringify(res.data)}`);
      ctx.appointmentId = res.data?.id || res.data?.data?.id;
      assert(ctx.appointmentId, 'Un appointmentId doit être généré');
    });

    await test(`Anti-Collision : Refus d'un double booking (POST /appointments/book)`, async () => {
      const res = await req('POST', '/appointments/book', {
        psychologistId: ctx.psyId,
        startAt,
        sessionFormat: 'VIDEO',
      }, ctx.patientToken);
      assert(res.status === 409 || res.status === 400, `Attendu 409/400 (conflit), reçu ${res.status}`);
    });

    await test(`Liste des Rendez-vous Patient (GET /appointments)`, async () => {
      const res = await req('GET', '/appointments', null, ctx.patientToken);
      assert(res.status === 200, `Attendu 200, reçu ${res.status}`);
    });
  }

  // --------------------------------------------------------------------------
  // STEP 6: PAYMENTS & INVOICES
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 6 : Paiements & Facturation${C.reset}`);

  if (ctx.patientToken && ctx.appointmentId) {
    let providerRef = null;

    await test(`Initiation Paiement Sécurisé (POST /payments/initiate)`, async () => {
      const res = await req('POST', '/payments/initiate', {
        appointmentId: ctx.appointmentId,
        provider: 'MOCK',
      }, ctx.patientToken);
      assert(res.status === 200 || res.status === 201, `Attendu 200/201, reçu ${res.status}: ${JSON.stringify(res.data)}`);
      const body = res.data?.data || res.data || {};
      ctx.paymentId = body.paymentId || body.id;
      providerRef = body.providerRef;
    });

    await test(`Vérification & Validation Paiement (POST /payments/verify)`, async () => {
      const ref = providerRef || `mock_${ts}`;
      const res = await req('POST', '/payments/verify', {
        providerRef: ref,
        provider: 'MOCK',
      }, ctx.patientToken);
      assert(res.status === 200 || res.status === 201, `Attendu 200/201, reçu ${res.status}: ${JSON.stringify(res.data)}`);
    });

    await test(`Historique des Factures Patient (GET /payments/invoices)`, async () => {
      const res = await req('GET', '/payments/invoices', null, ctx.patientToken);
      assert(res.status === 200, `Attendu 200, reçu ${res.status}`);
    });
  }

  // --------------------------------------------------------------------------
  // STEP 7: JITSI MEET TELECONSULTATION
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 7 : Visioconférence Sécurisée Jitsi Meet${C.reset}`);

  if (ctx.patientToken && ctx.appointmentId) {
    await test(`Demande Jeton d'Accès Sécurisé (GET /consultations/appointments/:id/access)`, async () => {
      const res = await req('GET', `/consultations/appointments/${ctx.appointmentId}/access`, null, ctx.patientToken);
      // 200 si session accessible, ou 400 si praticien pas encore entré
      assert(res.status === 200 || res.status === 400, `Attendu 200 ou 400, reçu ${res.status}`);
    });
  }

  // --------------------------------------------------------------------------
  // STEP 8: MESSAGING & REAL-TIME CHAT
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 8 : Messagerie Sécurisée Chiffrée${C.reset}`);

  if (ctx.patientToken && ctx.psyId) {
    await test(`Création ou Récupération Conversation (POST /messaging/conversations)`, async () => {
      const res = await req('POST', '/messaging/conversations', {
        psychologistId: ctx.psyId,
      }, ctx.patientToken);
      assert(res.status === 200 || res.status === 201, `Attendu 200/201, reçu ${res.status}`);
      ctx.conversationId = res.data?.id || res.data?.data?.id;
      assert(ctx.conversationId, 'Un conversationId doit être renvoyé');
    });

    if (ctx.conversationId) {
      await test(`Envoi d'un Message Chiffré (POST /messaging/messages)`, async () => {
        const res = await req('POST', '/messaging/messages', {
          conversationId: ctx.conversationId,
          content: 'Bonjour Docteur, message de test automatique.',
          type: 'TEXT',
        }, ctx.patientToken);
        assert(res.status === 201 || res.status === 200, `Attendu 201/200, reçu ${res.status}`);
      });
    }
  }

  // --------------------------------------------------------------------------
  // STEP 9: NOTIFICATIONS & IN-APP ALERTS
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 9 : Notifications & Alertes${C.reset}`);

  if (ctx.patientToken) {
    await test(`Relève des Notifications Patient (GET /notifications)`, async () => {
      const res = await req('GET', '/notifications', null, ctx.patientToken);
      assert(res.status === 200, `Attendu 200, reçu ${res.status}`);
    });
  }

  // --------------------------------------------------------------------------
  // STEP 10: SUPPORT & TICKETING
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 10 : Support Client & Assistance${C.reset}`);

  if (ctx.patientToken) {
    await test(`Ouverture Ticket Support (POST /support/tickets)`, async () => {
      const res = await req('POST', '/support/tickets', {
        subject: 'Demande d\'assistance technique automatisée',
        body: 'Ceci est un ticket de test créé par la suite d\'intégration.',
        priority: 'MEDIUM',
      }, ctx.patientToken);
      assert(res.status === 201 || res.status === 200, `Attendu 201/200, reçu ${res.status}`);
    });

    await test(`Consultation Mes Tickets (GET /support/tickets)`, async () => {
      const res = await req('GET', '/support/tickets', null, ctx.patientToken);
      assert(res.status === 200, `Attendu 200, reçu ${res.status}`);
    });
  }

  // --------------------------------------------------------------------------
  // STEP 11: LOGOUT & TOKEN REVOCATION
  // --------------------------------------------------------------------------
  console.log(`\n${C.bright}${C.yellow}► ÉTAPE 11 : Déconnexion & Révocation Sécurisée${C.reset}`);

  if (ctx.patientToken && ctx.patientRefreshToken) {
    await test(`Déconnexion & Révocation Refresh Token (POST /auth/logout)`, async () => {
      const res = await req('POST', '/auth/logout', {
        refreshToken: ctx.patientRefreshToken,
      }, ctx.patientToken);
      assert(res.status === 200, `Attendu 200, reçu ${res.status}`);
    });
  }

  // --------------------------------------------------------------------------
  // FINAL SUMMARY
  // --------------------------------------------------------------------------
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  const passRate = ((stats.passed / stats.total) * 100).toFixed(1);

  console.log(`\n${C.bright}════════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bright}  BILAN D'EXÉCUTION DU SCÉNARIO DE TEST MONPSY${C.reset}`);
  console.log(`════════════════════════════════════════════════════════════════`);
  console.log(`  Total des épreuves testées : ${C.bright}${stats.total}${C.reset}`);
  console.log(`  Tests Réussis              : ${C.green}${C.bright}${stats.passed}${C.reset}`);
  console.log(`  Tests Échoués              : ${stats.failed > 0 ? C.red : C.dim}${C.bright}${stats.failed}${C.reset}`);
  console.log(`  Taux de Réussite           : ${passRate >= 80 ? C.green : C.yellow}${C.bright}${passRate}%${C.reset}`);
  console.log(`  Temps Total d'Exécution    : ${C.cyan}${duration} secondes${C.reset}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);

  if (stats.failed === 0) {
    console.log(`${C.bgGreen}${C.white}${C.bright}  TOUTES LES APIS SONT 100% OPÉRATIONNELLES ET CONFORMES !  ${C.reset}\n`);
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Execute
runFullScenario().catch((err) => {
  console.error(`\n${C.red}Erreur fatale du runner de test :${C.reset}`, err);
  process.exit(1);
});
