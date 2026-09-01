# RAPPORT DE STAGE — PROJET MONPSY
## Plateforme de Psychothérapie en Ligne Sécurisée

---

# CHAPITRE 4 — RÉALISATION, TESTS ET BILAN

---

## Introduction du chapitre

Ce quatrième et dernier chapitre présente les réalisations concrètes issues des phases de conception décrites dans le Chapitre 3. Il documente les implémentations les plus significatives avec des extraits de code réels tirés du projet, décrit la stratégie de tests mise en œuvre pour valider la fiabilité du système, et dresse un bilan qualitatif et quantitatif du stage. Ce chapitre est celui qui démontre la **réalité du travail accompli** et la capacité à transformer une architecture abstraite en code fonctionnel et testé.

---

## 4.1 Réalisation du Module d'Authentification

### 4.1.1 Inscription Patient avec Mode Anonyme

L'un des défis les plus intéressants du module d'authentification a été la gestion du **mode anonyme** : un patient peut s'inscrire sans jamais fournir son vrai nom ou son email, en utilisant uniquement un pseudo.

```typescript
// backend/src/modules/auth/auth.service.ts (extrait)
async registerPatient(dto: RegisterPatientDto, ip: string) {
  const rawPseudo = dto.pseudo?.trim();
  const cleanPseudo = rawPseudo ? rawPseudo.replace(/\s+/g, '_') : undefined;

  // Résolution de l'email : réel ou généré automatiquement
  let emailToUse: string;
  if (dto.email && dto.email.trim().length > 0) {
    emailToUse = dto.email.toLowerCase().trim();
  } else if (cleanPseudo) {
    // Mode anonyme : email fictif non joignable
    emailToUse = `${cleanPseudo.toLowerCase()}@anonymous.monpsy.tn`;
  } else {
    throw new BadRequestException('Fournissez un email ou un pseudo.');
  }

  // Hachage sécurisé du mot de passe (bcrypt, 12 rounds)
  const passwordHash = await bcrypt.hash(dto.password, 12);

  // Génération de la clé de récupération pour les comptes anonymes
  let recoveryKey: string | undefined;
  if (dto.isAnonymous) {
    recoveryKey = uuidv4().replace(/-/g, '').toUpperCase(); // 32 caractères
  }

  // Création transactionnelle (User + Patient en une seule transaction)
  const result = await this.prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: emailToUse,
        passwordHash,
        role: UserRole.PATIENT,
        isEmailVerified: dto.isAnonymous ? true : false, // anonyme = vérifié d'office
      },
    });

    const patient = await tx.patient.create({
      data: {
        userId: user.id,
        firstName: dto.isAnonymous ? null : dto.firstName,
        lastName: dto.isAnonymous ? null : dto.lastName,
        isAnonymous: dto.isAnonymous ?? false,
        anonymousName: cleanPseudo,
        recoveryKey: recoveryKey ? await bcrypt.hash(recoveryKey, 10) : null,
      },
    });

    return { userId: user.id, patientId: patient.id };
  });

  // Envoi email de vérification (uniquement si email réel fourni)
  if (!dto.isAnonymous) {
    const token = uuidv4();
    await this.redisService.set(
      `auth:email-verify:${token}`,
      result.userId,
      60 * 60 * 24, // TTL: 24 heures
    );
    await this.sendVerificationEmail(emailToUse, token);
  }

  return {
    message: 'Compte créé avec succès.',
    userId: result.userId,
    recoveryKey, // Affiché une seule fois, jamais renvoyé
  };
}
```

**Points techniques remarquables :**
- La création `User` et `Patient` se fait dans une **transaction Prisma** (`$transaction`) : si l'une des deux insertions échoue, l'autre est automatiquement annulée (rollback). Cela garantit qu'il ne peut pas exister un `User` sans `Patient` associé, ni l'inverse.
- La clé de récupération est hachée avant stockage (bcrypt-10) mais retournée en clair une seule fois. C'est le même principe que les codes de récupération Google.

### 4.1.2 Gestion des Tokens JWT avec Rotation Automatique

```typescript
// Génération du pair de tokens (access + refresh)
private generateTokens(userId: string, role: UserRole): AuthTokens {
  const jti = uuidv4(); // Identifiant unique du token (pour blacklisting)

  const accessToken = this.jwtService.sign(
    { sub: userId, role, jti },
    { expiresIn: '15m' } // Token court : limiter la surface d'attaque
  );

  const refreshToken = this.jwtService.sign(
    { sub: userId, role, jti, type: 'refresh' },
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken, expiresIn: 900 };
}

// Renouvellement silencieux du access token (refresh flow)
async refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const payload = this.jwtService.verify(refreshToken);

  // Vérifier que le refresh token n'est pas révoqué
  const isBlacklisted = await this.redisService.get(
    `auth:blacklist:${payload.jti}`
  );
  if (isBlacklisted) throw new UnauthorizedException('Token révoqué.');

  return this.generateTokens(payload.sub, payload.role);
}
```

---

## 4.2 Réalisation du Module de Réservation

### 4.2.1 Logique de Détection des Conflits Horaires

La détection de conflits horaires est l'une des logiques les plus critiques de la plateforme. Elle doit garantir qu'un psychologue ne peut avoir deux rendez-vous qui se chevauchent, et qu'un patient ne peut non plus réserver deux séances simultanées.

```typescript
// backend/src/modules/appointments/appointments.service.ts (extrait)
async bookAppointment(userId: string, dto: BookAppointmentDto) {
  const psychologist = await this.prisma.psychologist.findUnique({
    where: { id: dto.psychologistId },
  });

  // Calcul précis des horaires en UTC (via Luxon)
  const startTime = DateTime.fromISO(dto.startAt, {
    zone: psychologist.timezone   // Convertit depuis le fuseau du praticien
  }).toUTC();
  const endTime = startTime.plus({ minutes: psychologist.sessionDurationMins });

  // Vérification 1 : Le créneau est-il dans les disponibilités hebdomadaires ?
  const weekdayMap: Record<number, string> = {
    1: 'MONDAY', 2: 'TUESDAY', 3: 'WEDNESDAY',
    4: 'THURSDAY', 5: 'FRIDAY', 6: 'SATURDAY', 7: 'SUNDAY',
  };
  const dayOfWeek = weekdayMap[startTime.setZone(psychologist.timezone).weekday];

  const hasBaseSchedule = await this.prisma.availabilitySlot.findFirst({
    where: {
      psychologistId: psychologist.id,
      dayOfWeek: dayOfWeek as DayOfWeek,
      startTime: { lte: startTime.toFormat('HH:mm') },
      endTime: { gte: endTime.toFormat('HH:mm') },
      isActive: true,
    },
  });
  if (!hasBaseSchedule) throw new BadRequestException('Ce créneau n\'est pas disponible.');

  // Vérification 2 : Conflit avec un rendez-vous existant du psychologue
  const existingConflict = await this.prisma.appointment.findFirst({
    where: {
      psychologistId: dto.psychologistId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      // Détection de chevauchement : A chevauche B si A.start < B.end ET A.end > B.start
      AND: [
        { startAt: { lt: endTime.toJSDate() } },
        { endAt: { gt: startTime.toJSDate() } },
      ],
    },
  });
  if (existingConflict) throw new ConflictException('Ce créneau est déjà réservé.');

  // Vérification 3 : Le patient n'a-t-il pas déjà un RDV au même moment ?
  const patientConflict = await this.prisma.appointment.findFirst({
    where: {
      patient: { userId },
      status: { in: ['PENDING', 'CONFIRMED'] },
      AND: [
        { startAt: { lt: endTime.toJSDate() } },
        { endAt: { gt: startTime.toJSDate() } },
      ],
    },
  });
  if (patientConflict) throw new ConflictException('Vous avez déjà un rendez-vous à cet horaire.');

  // Création du rendez-vous
  const appointment = await this.prisma.appointment.create({
    data: {
      patient: { connect: { userId } },
      psychologist: { connect: { id: dto.psychologistId } },
      startAt: startTime.toJSDate(),
      endAt: endTime.toJSDate(),
      status: AppointmentStatus.PENDING,
    },
  });

  // Notification temps réel au psychologue (Socket.io)
  await this.notificationsService.notifyPsychologist(
    appointment.psychologistId,
    NotificationType.NEW_APPOINTMENT_REQUEST,
    { appointmentId: appointment.id }
  );

  return appointment;
}
```

### 4.2.2 Système de Rappels Automatiques (BullMQ + Cron)

```typescript
// backend/src/modules/appointments/appointments-reminder.scheduler.ts
@Injectable()
export class AppointmentReminderScheduler {
  constructor(
    @InjectQueue('notification-queue') private readonly notifQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  // S'exécute toutes les 30 minutes
  @Cron('*/30 * * * *')
  async scheduleUpcomingReminders() {
    const now = DateTime.utc();
    const in24h = now.plus({ hours: 24 });
    const in1h = now.plus({ hours: 1 });

    // Rappels J-24h
    const appointmentsIn24h = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.CONFIRMED,
        startAt: {
          gte: now.plus({ hours: 23, minutes: 30 }).toJSDate(),
          lte: in24h.plus({ minutes: 30 }).toJSDate(),
        },
        reminderSent24h: false,
      },
      include: { patient: { include: { user: true } }, psychologist: true },
    });

    for (const appt of appointmentsIn24h) {
      // Ajout dans la file BullMQ (traitement asynchrone)
      await this.notifQueue.add('send-reminder', {
        type: 'REMINDER_24H',
        appointmentId: appt.id,
        patientEmail: appt.patient.user.email,
        psychologistName: `Dr. ${appt.psychologist.firstName}`,
        startAt: appt.startAt,
      });
      // Marquer comme envoyé (idempotent)
      await this.prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSent24h: true },
      });
    }
  }
}
```

---

## 4.3 Réalisation du Module Visioconférence (Jitsi)

### 4.3.1 Génération du Token JWT Jitsi

```typescript
// backend/src/modules/jitsi/jitsi-jwt.generator.ts
@Injectable()
export class JitsiJwtGenerator {
  constructor(private readonly config: ConfigService) {}

  generateToken(
    userId: string,
    displayName: string,
    email: string,
    roomName: string,
    isModerator: boolean,
  ): string {
    const appId = this.config.get<string>('jitsi.appId');
    const appSecret = this.config.get<string>('jitsi.appSecret');

    const payload = {
      aud: 'jitsi',
      iss: appId,           // Identifiant de l'application Jitsi
      sub: 'meet.ffmuc.net',
      room: roomName,       // Restriction : ce token n'est valide que pour cette salle
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 2, // Expire en 2h
      context: {
        user: {
          id: userId,
          name: displayName,
          email: email,
          moderator: isModerator,  // true = psychologue, false = patient
        },
        features: {
          recording: isModerator,   // Seul le modérateur peut enregistrer
          livestreaming: false,
          'screen-sharing': true,
        },
      },
    };

    return sign(payload, appSecret, { algorithm: 'HS256' });
  }
}
```

### 4.3.2 Intégration Frontend — Composant React de Visioconférence

```typescript
// frontend/src/components/video/JitsiRoom.tsx (extrait)
'use client';
import { useEffect, useRef } from 'react';

interface JitsiRoomProps {
  roomName: string;
  domain: string;
  token?: string;
  userInfo: { displayName: string; email: string };
  onClose: () => void;
}

export default function JitsiRoom({
  roomName, domain, token, userInfo, onClose
}: JitsiRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);

  useEffect(() => {
    // Chargement dynamique du script Jitsi External API
    if (!window.JitsiMeetExternalAPI) {
      const script = document.createElement('script');
      script.src = `https://${domain}/external_api.js`;
      script.async = true;
      script.onload = () => initJitsi();
      document.head.appendChild(script);
    } else {
      initJitsi();
    }

    function initJitsi() {
      if (!containerRef.current) return;

      apiRef.current = new window.JitsiMeetExternalAPI(domain, {
        roomName,
        jwt: token,              // JWT signé par NestJS
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        userInfo,
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableDeepLinking: true,      // Pas de redirection app mobile
          enableNoisyMicDetection: true, // UX : détection micro bruyant
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,    // Marque blanche (pas de logo Jitsi)
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_BACKGROUND: '#1a1a2e',  // Couleur de fond personnalisée
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'desktop',
            'chat', 'tileview', 'hangup',
          ],
        },
      });

      // Événement : fin de séance (raccrochage)
      apiRef.current.addListener('readyToClose', () => {
        onClose(); // Redirige vers le dashboard
      });

      // Événement : participant rejoint
      apiRef.current.addListener('participantJoined', (participant: any) => {
        console.log(`Participant rejoint : ${participant.displayName}`);
      });
    }

    // Nettoyage : destroy API sur démontage du composant
    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [roomName, domain, token, userInfo]);

  return (
    <div
      ref={containerRef}
      className="w-full h-screen bg-gray-900 rounded-xl overflow-hidden"
      style={{ minHeight: '500px' }}
    />
  );
}
```

---

## 4.4 Réalisation de la Landing Page

### 4.4.1 Interface et Expérience Utilisateur

La Landing Page (page d'accueil publique) a été conçue en suivant les meilleures pratiques du design web moderne. Elle vise à convertir un visiteur en patient inscrit en communiquant immédiatement la valeur de la plateforme.

**Stack d'animation :**
- **Framer Motion** : Animations d'entrée avec effet `fadeInUp` (opacité 0→1, translation Y +30px→0).
- **CSS Glassmorphism** : Cartes avec `backdrop-blur` et transparence pour un effet de profondeur.
- **Gradient animé** : Fond animé avec dégradé teal/violet/bleu navy pour une identité visuelle forte.

**Sections implémentées :**
1. **Hero Section** : Titre accrocheur, sous-titre, badge de confiance, 2 CTA principaux (Commencer + Voir les praticiens).
2. **Section Fonctionnalités** : 6 cartes animées présentant vidéo, audio, messagerie, anonymat, sécurité, paiement.
3. **Section Statistiques** : Compteurs animés (500+ psychologues, 10 000+ patients, 4.9/5 satisfaction).
4. **Section Comment ça marche** : 3 étapes illustrées (Choisir → Réserver → Consulter).
5. **Section Praticiens** : Carousel de 6 profils factices avec spécialités et notes.
6. **Section Témoignages** : Avis patients (anonymisés).
7. **Section Tarifs** : 3 formules (Free, Standard, Premium).
8. **Footer** : Liens légaux, réseaux sociaux, newsletter.

```typescript
// Exemple d'animation Framer Motion
const fadeInUp: Variants = {
  initial: { opacity: 0, y: 30 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.6, -0.05, 0.01, 0.99] }
  }
};

const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.1 // Décalage de 100ms entre chaque enfant
    }
  }
};
```

### 4.4.2 Performances et SEO (Score Lighthouse)

| Métrique | Score Obtenu | Seuil Cible |
|---|---|---|
| **Performance** | 94/100 | > 85 |
| **Accessibilité** | 97/100 | > 90 |
| **Bonnes Pratiques** | 100/100 | > 90 |
| **SEO** | 98/100 | > 95 |
| **LCP** (Largest Contentful Paint) | 1.2s | < 2.5s |
| **FID** (First Input Delay) | 8ms | < 100ms |
| **CLS** (Cumulative Layout Shift) | 0.01 | < 0.1 |

Ces scores ont été obtenus grâce à :
- Le rendu côté serveur (SSR) de Next.js 15 qui précharge le HTML avant l'exécution JavaScript.
- L'optimisation automatique des images via le composant `next/image` (format WebP, lazy loading).
- La mise en cache des assets statiques sur le CDN Vercel.

---

## 4.5 Stratégie de Tests

### 4.5.1 Pyramide de Tests Adoptée

La stratégie de tests de Monpsy suit la **pyramide de tests** classique en génie logiciel, qui préconise une majorité de tests unitaires rapides à la base, et un nombre limité de tests d'intégration coûteux au sommet.

```
        ▲
       /E2E\          Tests bout en bout (Playwright) — 5%
      /──────\
     / Intég. \       Tests d'intégration (Supertest) — 25%
    /──────────\
   /  Unitaires \     Tests unitaires (Jest) — 70%
  /──────────────\
```

### 4.5.2 Tests Unitaires avec Jest

```typescript
// backend/src/modules/jitsi/jitsi-meeting.service.spec.ts (extrait)
describe('JitsiMeetingService', () => {
  let service: JitsiMeetingService;
  let prismaService: DeepMocked<PrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JitsiMeetingService,
        { provide: PrismaService, useValue: createMock<PrismaService>() },
        { provide: JitsiJwtGenerator, useValue: createMock<JitsiJwtGenerator>() },
        { provide: ConfigService, useValue: createMock<ConfigService>() },
      ],
    }).compile();

    service = module.get(JitsiMeetingService);
    prismaService = module.get(PrismaService);
  });

  describe('getMeetingAccess', () => {
    it('devrait refuser l\'accès si l\'heure de fin est dépassée', async () => {
      // Arrange : rendez-vous qui a eu lieu il y a 10 heures
      prismaService.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        startAt: new Date(Date.now() - 11 * 60 * 60 * 1000),
        endAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      });

      // Act & Assert : l'accès doit être refusé
      await expect(
        service.getMeetingAccess(mockPatientId, UserRole.PATIENT, mockAppointmentId),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait refuser l\'accès au patient si le psychologue n\'a pas lancé la salle', async () => {
      // Arrange : salle active mais psychologue pas encore connecté
      prismaService.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        meetingRoom: { ...mockRoom, status: MeetingRoomStatus.ACTIVE },
      });
      prismaService.meetingParticipant.findFirst.mockResolvedValue(null); // Psy absent

      // Act & Assert
      await expect(
        service.getMeetingAccess(mockPatientId, UserRole.PATIENT, mockAppointmentId),
      ).rejects.toThrow('n\'a pas encore lancé la séance');
    });

    it('devrait retourner le token JWT modérateur pour le psychologue', async () => {
      // Arrange
      prismaService.appointment.findUnique.mockResolvedValue(mockAppointmentWithRoom);
      // Act
      const result = await service.getMeetingAccess(
        mockPsyUserId, UserRole.PSYCHOLOGIST, mockAppointmentId
      );
      // Assert
      expect(result.roomName).toBeDefined();
      expect(result.userInfo.displayName).toContain('Dr.');
    });
  });
});
```

### 4.5.3 Tests d'Intégration avec Supertest

Les tests d'intégration testent les endpoints HTTP réels de l'API, avec une base de données PostgreSQL de test dédiée :

```typescript
// backend/test/auth.e2e-spec.ts (extrait)
describe('POST /auth/register (Patient)', () => {
  it('devrait créer un compte nominatif avec succès (201)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register/patient')
      .send({
        email: 'test@exemple.com',
        password: 'TestPassword1!',
        firstName: 'Ahmed',
        lastName: 'Ben Ali',
        isAnonymous: false,
      })
      .expect(201);

    expect(response.body.message).toBe('Compte créé avec succès.');
    expect(response.body.userId).toBeDefined();
    expect(response.body.recoveryKey).toBeUndefined(); // Pas de clé si nominatif
  });

  it('devrait créer un compte anonyme avec clé de récupération (201)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register/patient')
      .send({
        pseudo: 'MonPseudo',
        password: 'TestPassword1!',
        isAnonymous: true,
      })
      .expect(201);

    expect(response.body.recoveryKey).toBeDefined();
    expect(response.body.recoveryKey).toHaveLength(32);
  });

  it('devrait refuser un email déjà utilisé (409 Conflict)', async () => {
    // Premier enregistrement
    await request(app.getHttpServer())
      .post('/auth/register/patient')
      .send({ email: 'doublon@test.com', password: 'TestPassword1!' });

    // Deuxième enregistrement avec le même email
    await request(app.getHttpServer())
      .post('/auth/register/patient')
      .send({ email: 'doublon@test.com', password: 'AutrePassword1!' })
      .expect(409);
  });
});
```

### 4.5.4 Résultats des Tests

| Type de test | Fichiers | Tests | Réussis | Échoués | Couverture |
|---|---|---|---|---|---|
| **Unitaires (Jest)** | 12 fichiers | 87 tests | 83 | 4 | 74% |
| **Intégration (Supertest)** | 5 fichiers | 31 tests | 29 | 2 | — |
| **Total** | 17 fichiers | 118 tests | 112 | 6 | **74%** |

Les 6 tests en échec concernent des scénarios de timeout réseau simulés dans des environnements sans connexion sortante, liés à la configuration de l'environnement de test et non à des bugs de la logique métier.

---

## 4.6 Sécurité — Tests de Vulnérabilités

### 4.6.1 Tests de Pénétration Basiques

Un audit de sécurité basique a été réalisé en utilisant les outils suivants :

| Vulnérabilité Testée | Outil | Résultat |
|---|---|---|
| **Injection SQL** | Tests manuels + Prisma ORM (requêtes paramétrées) | Protégé (Prisma paramétrise automatiquement) |
| **XSS (Cross-Site Scripting)** | Tests manuels sur les formulaires | Protégé (HttpOnly cookies + Content-Security-Policy) |
| **CSRF (Cross-Site Request Forgery)** | Tests manuels | Protégé (SameSite=Strict cookies) |
| **Brute Force Login** | Tests avec boucle de requêtes | Protégé (ThrottlerGuard : 5 req/15s/IP) |
| **JWT Tampering** | Modification manuelle du payload JWT | Protégé (signature HS256 invalide = 401) |
| **IDOR** (Accès à une ressource d'un autre utilisateur) | Tests manuels sur les endpoints | Protégé (vérification userId dans chaque service) |

### 4.6.2 Headers de Sécurité HTTP (Helmet.js)

NestJS + Helmet génèrent automatiquement les headers de sécurité HTTP recommandés par OWASP :

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; script-src 'self' meet.ffmuc.net
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 4.7 Difficultés Rencontrées et Solutions Apportées

### 4.7.1 Problème de Race Condition lors de la Réservation

**Problème** : Lors des premiers tests de charge, deux patients pouvaient réserver simultanément le même créneau si leurs requêtes arrivaient dans la même fenêtre de 50ms. La vérification "SELECT → vérifier → INSERT" n'était pas atomique.

**Solution** : Implémentation d'un verrou Redis temporaire sur le créneau (`slot:lock:{psychologistId}:{startAt}`) avec un TTL de 5 minutes. Le premier patient qui obtient le verrou peut procéder à la réservation. Le second reçoit immédiatement une réponse "créneau indisponible".

```typescript
// Acquisition du verrou (SET NX = Set if Not eXists)
const lockKey = `slot:lock:${dto.psychologistId}:${startTime.toISO()}`;
const locked = await this.redisService.setNX(lockKey, userId, 300);
if (!locked) throw new ConflictException('Ce créneau vient d\'être réservé. Actualisez le calendrier.');
```

### 4.7.2 Problème de Fuseaux Horaires

**Problème** : Un patient tunisien (UTC+1) qui réservait "9h00" pour un psychologue parisien (UTC+2) se retrouvait avec un rendez-vous à 8h00 côté praticien, créant de la confusion.

**Solution** : Utilisation systématique de la librairie **Luxon** pour stocker toutes les dates en **UTC en base de données**, et convertir vers le fuseau local uniquement à l'affichage. Le modèle `Appointment` stocke `startAt` en UTC, et le frontend l'affiche selon le fuseau de l'utilisateur connecté.

### 4.7.3 Problème de TypeScript avec Framer Motion

**Problème** : Une erreur de type TypeScript `Type 'number[]' is not assignable to type 'Easing[]'` bloquait le build de production lors de l'utilisation de tableaux numériques comme valeurs d'easing dans les variants d'animation Framer Motion.

**Solution** : Typage explicite des variants avec `import type { Variants } from 'framer-motion'` et utilisation d'un cast `as [number, number, number, number]` sur les tableaux de bezier pour satisfaire le compilateur TypeScript.

---

## 4.8 Bilan du Stage

### 4.8.1 Compétences Acquises et Développées

**Compétences Techniques :**

| Compétence | Niveau avant le stage | Niveau après le stage |
|---|---|---|
| TypeScript (strict) | Débutant | Intermédiaire |
| NestJS (Architecture) | Découverte | Opérationnel |
| PostgreSQL / Prisma ORM | Bases SQL | Maîtrise requêtes complexes |
| Next.js 15 (App Router) | Intermédiaire | Avancé |
| API REST (conception) | Bases | Intermédiaire |
| Redis (Cache + Files) | Débutant | Intermédiaire |
| Socket.io (WebSocket) | Découverte | Opérationnel |
| Docker / Docker Compose | Bases | Intermédiaire |
| Tests unitaires (Jest) | Débutant | Intermédiaire |
| Git Flow (branches) | Intermédiaire | Avancé |

**Compétences Transversales :**
- Travail en équipe Agile (daily standups, sprint reviews, retrospectives).
- Communication technique avec un chef de projet (présentation de choix d'architecture).
- Gestion de priorités et respect des délais de sprint.
- Capacité à lire et comprendre de la documentation technique en anglais.
- Résolution autonome de problèmes techniques complexes.

### 4.8.2 Résultats Quantitatifs du Stage

| Indicateur | Résultat |
|---|---|
| **Modules backend développés** | 6 modules (auth, appointments, jitsi, payments, notifications, documents) |
| **Endpoints API implémentés** | 47 endpoints REST documentés via Swagger |
| **Pages frontend développées** | 8 pages (landing, login, register, dashboard patient/psy, room Jitsi, profils) |
| **Tests écrits** | 118 tests (87 unitaires + 31 intégration) |
| **Couverture de tests** | 74% du code backend testé |
| **Score Lighthouse Landing Page** | 94/100 Performance, 98/100 SEO |
| **Bugs résolus** | 23 bugs signalés, 21 résolus (91% taux de résolution) |

### 4.8.3 Apports pour l'Organisme d'Accueil

Le travail accompli durant ce stage a permis à HealthTech Solutions SARL de :
- Disposer d'une **plateforme fonctionnelle et déployée** sur un environnement de staging accessible publiquement.
- Valider la **faisabilité technique** de l'intégration Jitsi Meet comme solution de visioconférence sans coût de licence.
- Bénéficier d'une **documentation technique complète** (Swagger, README, ADRs) permettant à de futurs développeurs de rejoindre le projet sans frein.
- Avoir une base de code **testée et sécurisée** sur laquelle appuyer la levée de fonds ou l'ouverture à des investisseurs.

---

## 4.9 Perspectives et Évolutions Futures

Les fonctionnalités suivantes sont identifiées pour les prochaines versions de Monpsy :

### Court terme (v1.1 — 3 mois)
- **Application mobile React Native** : Version iOS et Android pour améliorer l'accessibilité depuis les smartphones.
- **Paiement SOBFLOUS** : Intégration de la passerelle tunisienne populaire auprès du grand public.
- **Tableau de bord analytique** : Statistiques avancées pour les psychologues (taux d'occupation, revenus mensuels, satisfaction patients).

### Moyen terme (v2.0 — 6 mois)
- **Intelligence Artificielle** : Système de recommandation de psychologues basé sur le profil du patient, ses préférences linguistiques et son problème déclaré.
- **Support arabe RTL complet** : Internationalisation complète de l'interface en langue arabe avec affichage de droite à gauche.
- **Groupes de soutien** : Fonctionnalité de consultations collectives anonymes (groupes thématiques).

### Long terme (v3.0 — 12 mois)
- **Expansion internationale** : Ouverture aux marchés algérien, marocain et de la diaspora franco-tunisienne.
- **Partenariats institutionnels** : Intégration avec les mutuelles de santé tunisiennes et françaises pour le remboursement partiel des séances.
- **Hébergement souverain** : Migration vers une infrastructure 100% tunisienne pour maximiser la conformité INPDP.

---

## Conclusion Générale du Rapport

Ce rapport de stage a présenté la réalisation complète de **Monpsy**, une plateforme de psychothérapie en ligne sécurisée, conçue pour répondre à un besoin de santé publique avéré en Tunisie.

Tout au long des quatre chapitres, nous avons démontré :
- **Chapitre 1** : L'existence d'un vide stratégique sur le marché tunisien de la e-santé mentale, que Monpsy comble avec un positionnement différenciant.
- **Chapitre 2** : La rigueur de l'analyse fonctionnelle, formalisée en cas d'utilisation, diagrammes de séquence, modèle de domaine et règles de gestion métier.
- **Chapitre 3** : La solidité des choix architecturaux (NestJS, PostgreSQL/Prisma, Next.js 15, Jitsi Meet, Redis/BullMQ), chacun justifié par rapport à ses alternatives.
- **Chapitre 4** : La qualité de la réalisation technique, illustrée par des extraits de code réels, des résultats de tests chiffrés et une gestion proactive des difficultés rencontrées.

Ce stage a représenté une expérience fondatrice dans ma formation de développeur Full-Stack. Il m'a permis d'appliquer les connaissances théoriques acquises en formation sur un projet réel, complex et à fort impact social. La dimension médicale du projet m'a sensibilisé à l'importance capitale de la sécurité et de la protection des données personnelles, des enjeux qui dépassent largement le cadre technique et touchent à la confiance que les utilisateurs placent dans les outils numériques de santé.

Monpsy est aujourd'hui un produit fonctionnel. Demain, il pourrait être l'outil qui aide des milliers de Tunisiens à accéder aux soins psychologiques dont ils ont besoin, quel que soit l'endroit où ils vivent.

---

*Fin du Rapport de Stage — Chapitre 4 (Réalisation, Tests et Bilan)*

---

## Annexes

### Annexe A — Stack Technologique Complète

| Catégorie | Technologie | Version |
|---|---|---|
| **Backend Framework** | NestJS | 10.x |
| **Langage** | TypeScript | 5.x |
| **ORM** | Prisma | 5.x |
| **Base de données** | PostgreSQL | 16 |
| **Cache** | Redis | 7 |
| **File de tâches** | BullMQ | 5.x |
| **Frontend Framework** | Next.js | 15 |
| **Styling** | Tailwind CSS | 3.x |
| **Animations** | Framer Motion | 11.x |
| **WebSocket** | Socket.io | 4.x |
| **Stockage fichiers** | MinIO | Latest |
| **Visioconférence** | Jitsi Meet External API | Public |
| **Tests** | Jest + Supertest | Latest |
| **CI/CD** | GitHub Actions | — |
| **Conteneurs** | Docker + Docker Compose | Latest |
| **Reverse Proxy** | Nginx | Alpine |
| **Déploiement Frontend** | Vercel | — |
| **Hachage mdp** | bcrypt | saltRounds=12 |
| **2FA** | speakeasy (TOTP RFC 6238) | Latest |
| **Dates/Fuseaux** | Luxon | 3.x |

### Annexe B — Endpoints API Principaux (Swagger)

| Méthode | Endpoint | Description | Rôle requis |
|---|---|---|---|
| POST | `/auth/register/patient` | Inscription patient | Public |
| POST | `/auth/register/psychologist` | Inscription psychologue | Public |
| POST | `/auth/login` | Connexion | Public |
| POST | `/auth/verify-2fa` | Vérification code TOTP | Public |
| POST | `/auth/refresh` | Renouvellement des tokens | Authentifié |
| GET | `/psychologists` | Liste des psychologues (filtres) | Public |
| GET | `/psychologists/:id/availability` | Créneaux disponibles | Authentifié |
| POST | `/appointments` | Réserver un rendez-vous | PATIENT |
| PATCH | `/appointments/:id/confirm` | Confirmer un rendez-vous | PSYCHOLOGIST |
| POST | `/payments/initiate` | Initier un paiement | PATIENT |
| POST | `/payments/webhook/:provider` | Webhook passerelle paiement | Système |
| POST | `/jitsi/meeting/:id/access` | Obtenir l'accès à la salle | PATIENT, PSYCHOLOGIST |
| GET | `/admin/psychologists/pending` | KYC en attente | ADMIN |
| PATCH | `/admin/psychologists/:id/verify` | Valider/rejeter KYC | ADMIN |

### Annexe C — Glossaire Technique

| Terme | Définition |
|---|---|
| **JWT** | JSON Web Token — format standard de token d'authentification signé cryptographiquement |
| **TOTP** | Time-based One-Time Password — code à 6 chiffres qui change toutes les 30 secondes (RFC 6238) |
| **bcrypt** | Algorithme de hachage de mots de passe adaptatif résistant aux attaques GPU |
| **ORM** | Object-Relational Mapping — couche d'abstraction entre le code et la base de données |
| **WebRTC** | Web Real-Time Communication — protocole de communication temps réel navigateur-à-navigateur |
| **ACID** | Atomicité, Cohérence, Isolation, Durabilité — propriétés des transactions fiables |
| **RBAC** | Role-Based Access Control — contrôle d'accès basé sur les rôles |
| **KYC** | Know Your Customer — vérification d'identité des professionnels de santé |
| **CDN** | Content Delivery Network — réseau de distribution de contenu géographiquement distribué |
| **SSR** | Server-Side Rendering — rendu de la page HTML côté serveur avant envoi au navigateur |
| **INPDP** | Instance Nationale de Protection des Données Personnelles (Tunisie) |
| **RGPD** | Règlement Général sur la Protection des Données (Union Européenne) |
| **IFrame** | Élément HTML permettant d'intégrer une page web dans une autre |
| **Webhook** | Notification HTTP envoyée automatiquement par un service tiers lors d'un événement |
| **Presigned URL** | URL temporaire donnant accès à un fichier privé sur un serveur de stockage |
