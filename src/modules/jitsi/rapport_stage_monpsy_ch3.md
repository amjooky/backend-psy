# RAPPORT DE STAGE — PROJET MONPSY
## Plateforme de Psychothérapie en Ligne Sécurisée

---

# CHAPITRE 3 — CONCEPTION ET ARCHITECTURE TECHNIQUE

---

## Introduction du chapitre

Ce troisième chapitre constitue le cœur technique du rapport. Il présente et justifie l'ensemble des décisions d'architecture prises pour concevoir la plateforme Monpsy. Chaque choix technologique y est argumenté par rapport aux alternatives existantes, en mettant en avant les critères déterminants : performance, sécurité, maintenabilité, coût et adéquation au besoin métier. Ce chapitre est celui qui démontre la maturité technique du stagiaire et anticipe les questions du jury sur les fondements des choix réalisés.

---

## 3.1 Architecture Générale du Système

### 3.1.1 Vue d'Ensemble — Architecture en Couches

Monpsy adopte une **architecture en couches découplées** (Layered Architecture), communément appelée architecture N-Tiers dans le contexte des applications web. Cette approche garantit la séparation des responsabilités (Separation of Concerns — SoC), fondement de tout logiciel maintenable et évolutif.

```
╔══════════════════════════════════════════════════════════════════╗
║                    COUCHE PRÉSENTATION                           ║
║          Next.js 15 App Router — Vercel CDN Global              ║
║    [Landing Page] [Dashboard Patient] [Dashboard Psy] [Admin]   ║
╠══════════════════════════════════════════════════════════════════╣
║                    COUCHE RÉSEAU / PROXY                         ║
║              Nginx (Reverse Proxy + SSL Termination)             ║
║                 Rate Limiting — Load Balancing                   ║
╠══════════════════════════════════════════════════════════════════╣
║                    COUCHE APPLICATION (API)                      ║
║              NestJS 10 — TypeScript — Architecture Modulaire     ║
║  [Auth] [Users] [Appointments] [Payments] [Jitsi] [Messaging]   ║
║  [Notifications] [Documents] [Reviews] [Admin] [Audit]           ║
╠══════════════════════════════════════════════════════════════════╣
║                    COUCHE SERVICES TRANSVERSES                   ║
║     Redis 7 (Cache + Sessions)   BullMQ (File de tâches)        ║
║     Socket.io (Temps réel)       Nodemailer (Email SMTP)        ║
╠══════════════════════════════════════════════════════════════════╣
║                    COUCHE DONNÉES                                ║
║        PostgreSQL 16 (via Prisma ORM) — MinIO (Fichiers)        ║
║              Prisma Migrations — Chiffrement AES-256             ║
╠══════════════════════════════════════════════════════════════════╣
║                    SERVICES EXTERNES                             ║
║  Jitsi Meet API   Konnect/Flouci/Paymee/Stripe   SendGrid       ║
╚══════════════════════════════════════════════════════════════════╝
```

### 3.1.2 Architecture Modulaire du Backend (NestJS)

NestJS impose une organisation en **modules indépendants et réutilisables**, ce qui correspond exactement au principe de **faible couplage et forte cohésion** recommandé en génie logiciel. Chaque module encapsule sa logique métier, ses contrôleurs, ses services et ses entités Prisma.

```
backend/src/
├── modules/
│   ├── auth/               # Authentification, JWT, 2FA, sessions
│   ├── patients/           # Profils patients, anonymat
│   ├── psychologists/      # Profils praticiens, KYC, disponibilités
│   ├── appointments/       # Réservations, machine à états, rappels
│   ├── availability/       # Créneaux hebdomadaires, blocage horaire
│   ├── payments/           # Multi-passerelles, webhooks, factures
│   ├── jitsi/              # Rooms sécurisées, JWT Jitsi, participants
│   ├── messaging/          # Chat temps réel (Socket.io + Redis pub/sub)
│   ├── notifications/      # Email, push, in-app (BullMQ)
│   ├── documents/          # Upload MinIO, permissions, accès signé
│   ├── reviews/            # Avis patients, modération
│   ├── admin/              # Back-office, KYC, statistiques
│   ├── audit/              # Logs d'actions sensibles
│   └── support/            # Tickets de support
├── database/               # PrismaService, connexion DB
├── redis/                  # RedisService, cache
├── common/
│   ├── guards/             # JwtAuthGuard, RolesGuard, ThrottlerGuard
│   ├── decorators/         # @CurrentUser, @Roles, @Public
│   ├── filters/            # HttpExceptionFilter (responses uniformes)
│   ├── interceptors/       # LoggingInterceptor, TransformInterceptor
│   └── utils/              # CryptoUtil, DateUtil
└── main.ts                 # Bootstrap : CORS, Swagger, ValidationPipe
```

---

## 3.2 Justification des Choix Technologiques

Cette section constitue le cœur de l'argumentation technique. Chaque choix est présenté avec ses alternatives et les raisons précises de la décision prise.

### 3.2.1 Backend : NestJS (TypeScript) vs Alternatives

| Critère | **NestJS** ✅ | Express.js | FastAPI (Python) | Spring Boot (Java) |
|---|---|---|---|---|
| **Langage** | TypeScript strict | JavaScript/TS optionnel | Python | Java |
| **Architecture** | Modulaire imposée | Libre (peut devenir chaotique) | MVC basique | Modulaire (complexe) |
| **TypeScript natif** | Oui, full support | Partiel | Non | Non |
| **Documentation auto** | Swagger intégré | Manuel | Swagger intégré | Swagger (config) |
| **Validation intégrée** | class-validator | Manuel | Pydantic | javax.validation |
| **ORM recommandé** | Prisma / TypeORM | Aucun imposé | SQLAlchemy | Hibernate |
| **WebSockets** | Module natif | socket.io manuel | fastapi-websocket | Spring WebSocket |
| **Files de tâches** | BullMQ natif | Configuration manuelle | Celery | Spring Batch |
| **Courbe d'apprentissage** | Modérée | Faible | Faible | Élevée |

**Décision retenue : NestJS**

NestJS a été choisi pour trois raisons déterminantes :
1. **La cohérence TypeScript de bout en bout** : Le même langage est utilisé du frontend (Next.js) au backend (NestJS). Cela élimine les erreurs de communication inter-couches et permet le partage de types (DTOs, interfaces) entre les deux parties de l'application.
2. **L'architecture imposée est un avantage** : Sur un projet d'équipe de 6 personnes, l'absence de structure peut mener à une codebase incohérente. NestJS impose des conventions claires (modules, controllers, services, guards) qui rendent le code immédiatement compréhensible par tous les membres.
3. **L'écosystème intégré** : Les modules officiels pour Prisma, BullMQ, Socket.io, JWT, Swagger et Config sont maintenus par la communauté NestJS et s'intègrent sans friction.

> *Argument de soutenance : « Express.js aurait requis l'assemblage manuel de dizaines de bibliothèques sans garantie de cohérence. NestJS est Express.js, mais avec une structure imposée, un système d'injection de dépendances inspiré d'Angular, et un écosystème de modules prêts à l'emploi. C'est Express.js sans la liberté anarchique. »*

---

### 3.2.2 Base de Données : PostgreSQL 16 via Prisma ORM

| Critère | **PostgreSQL 16** ✅ | MySQL 8 | MongoDB | SQLite |
|---|---|---|---|---|
| **Type** | Relationnel (SQL) | Relationnel (SQL) | NoSQL (Documents) | Relationnel (fichier) |
| **Transactions ACID** | Oui, robuste | Oui | Limité (depuis 4.0) | Oui |
| **JSON natif** | Oui (JSONB) | Oui (JSON) | Natif | Non |
| **Full-text search** | Oui (pg_tsvector) | Basique | Oui (Atlas Search) | Basique |
| **Scalabilité** | Excellente | Bonne | Excellente | Limitée (mono-fichier) |
| **Licences** | Open Source (libre) | GPL/Commercial | SSPL (restrictions) | Domaine public |
| **Extensions** | pg_crypto, PostGIS | Limitées | N/A | N/A |

**Décision retenue : PostgreSQL 16**

Une plateforme médicale manipule des données sensibles (dossiers patients, historique de séances, transactions financières) qui requièrent une **intégrité référentielle absolue**. PostgreSQL garantit les propriétés ACID (Atomicité, Cohérence, Isolation, Durabilité) qui rendent impossible qu'un paiement soit enregistré sans rendez-vous associé, ou qu'un rendez-vous existe sans patient valide.

MongoDB aurait été pertinent pour un blog ou un catalogue produits, mais son modèle de données orienté documents est inadapté aux relations complexes de Monpsy (Patient → Appointment → Payment → MeetingRoom → MeetingParticipant → MeetingLog).

**Prisma ORM** a été choisi comme couche d'abstraction de la base de données pour :
- La **génération automatique du client TypeScript** à partir du schéma, éliminant tout risque d'erreur de typage dans les requêtes SQL.
- Les **migrations versionnées** (`prisma migrate dev`) qui permettent de tracer l'évolution du schéma en base de données dans le dépôt Git.
- La **lisibilité du schéma** : Le fichier `schema.prisma` est une documentation vivante de la structure de la base de données.

---

### 3.2.3 Frontend : Next.js 15 (App Router) vs Alternatives

| Critère | **Next.js 15** ✅ | React SPA (Vite) | Vue.js 3 | Angular 17 |
|---|---|---|---|---|
| **Rendu** | SSR + SSG + CSR hybride | CSR uniquement | SSR (Nuxt) / CSR | CSR / SSR (Angular Universal) |
| **SEO natif** | Excellent (SSR) | Mauvais (SPA pur) | Bon (Nuxt) | Moyen |
| **Performance** | Excellente (streaming) | Bonne | Très bonne | Correcte |
| **TypeScript** | Natif | Configurable | Configurable | Imposé |
| **Routing** | File-system (App Router) | React Router manuel | Vue Router | Angular Router |
| **Image Optimization** | Composant next/image | Manuel | Manuel | Manuel |
| **Déploiement** | Vercel (optimal) | N'importe où | N'importe où | N'importe où |
| **Server Components** | Oui (React 19) | Non | Non | Non |

**Décision retenue : Next.js 15 avec App Router**

Next.js 15 combine le meilleur des deux mondes : le rendu côté serveur (SSR) pour les pages publiques (Landing Page, profils psychologues) qui bénéficient ainsi d'un excellent référencement naturel (SEO), et le rendu côté client (CSR) pour les dashboards dynamiques (calendriers, messagerie en temps réel).

Pour une plateforme médicale, le SEO n'est pas un luxe : c'est un canal d'acquisition majeur. Un patient recherchant "psychologue en ligne Tunisie" doit trouver Monpsy via Google. Avec un SPA React classique, les pages ne sont pas indexées par les moteurs de recherche. Avec Next.js en SSR, elles le sont parfaitement.

Les **React Server Components** de Next.js 15 permettent de récupérer les données directement sur le serveur avant le rendu, éliminant les requêtes API superflues et améliorant le temps de chargement perçu.

---

### 3.2.4 Visioconférence : Jitsi Meet External API vs Alternatives Payantes

| Critère | **Jitsi Meet (Public)** ✅ | Zoom SDK | Whereby | Daily.co | Twilio Video |
|---|---|---|---|---|---|
| **Coût** | 0 € (gratuit) | ~250$/mois min. | ~59$/mois | ~79$/mois | ~0.003$/min/participant |
| **Installation** | Aucune | SDK lourd | Aucune | SDK | SDK |
| **Open Source** | Oui (Apache 2.0) | Non | Non | Non | Non |
| **Chiffrement E2E** | Oui (WebRTC DTLS-SRTP) | Oui (payant) | Oui | Oui | Oui |
| **Personnalisation UI** | Haute (IFrame API) | Modérée | Faible | Haute | Haute |
| **Contrôle des rooms** | Total | Limité | Modéré | Total | Total |
| **Intégration JWT** | Oui | Oui | Oui | Oui | Oui |
| **Dépendance cloud** | Faible (auto-hébergeable) | Forte | Forte | Forte | Forte |

**Décision retenue : Jitsi Meet External API (meet.ffmuc.net)**

Le choix de Jitsi Meet comme solution de visioconférence est un **choix stratégique fondamental** qui a directement influencé la viabilité économique de Monpsy. Les alternatives payantes (Zoom, Daily.co, Twilio) auraient ajouté un coût opérationnel de plusieurs centaines d'euros par mois dès le lancement, rendant la plateforme non viable pour un marché où le prix de la consultation est lui-même contraint.

**Implémentation technique concrète :**

L'intégration s'effectue via la **Jitsi External API** (IFrame API) :

```javascript
// Côté Frontend — Initialisation de la salle Jitsi dans un IFrame
const api = new window.JitsiMeetExternalAPI(domain, {
  roomName: meetingAccess.roomName,    // nom généré cryptographiquement
  jwt: meetingAccess.token,             // JWT signé par le backend NestJS
  parentNode: containerRef.current,     // div cible dans le DOM
  userInfo: {
    displayName: meetingAccess.userInfo.displayName,
    email: meetingAccess.userInfo.email,
  },
  configOverwrite: {
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    disableDeepLinking: true,           // empêche la redirection vers l'app mobile
  },
  interfaceConfigOverwrite: {
    SHOW_JITSI_WATERMARK: false,        // supprime le logo Jitsi
    TOOLBAR_BUTTONS: ['microphone', 'camera', 'hangup', 'chat'],
  },
});
```

**Sécurité de la salle :**
- Le nom de la salle est généré par `crypto.randomBytes(16).toString('hex')` → impossible à deviner.
- L'accès est conditionné à la présence d'un JWT valide signé par le backend.
- La salle est éphémère et expire automatiquement (enregistrement en base de données).
- Le psychologue est automatiquement désigné comme modérateur (`isModerator: true`).

---

### 3.2.5 Cache et File de Tâches : Redis 7 + BullMQ

**Redis 7** est utilisé pour deux objectifs distincts :

**a) Cache de session et données chaudes :**
```
Redis Key Structure:
├── auth:email-verify:{token}     TTL: 24h   → Token vérification email
├── auth:password-reset:{token}   TTL: 1h    → Token réinitialisation mdp
├── auth:blacklist:{jti}          TTL: 7d    → JWT révoqués (logout)
├── slot:lock:{slotId}            TTL: 5min  → Verrou créneau réservé
└── cache:psycho-profile:{id}     TTL: 15min → Cache profil psychologue
```

**b) BullMQ — File de tâches asynchrones :**

BullMQ (basé sur Redis) gère toutes les tâches asynchrones non bloquantes :

| File (Queue) | Tâche | Déclencheur |
|---|---|---|
| `email-queue` | Envoi d'email (vérification, confirmation) | À chaque événement email |
| `notification-queue` | Push notifications in-app | Réservation, annulation |
| `reminder-queue` | Rappels de rendez-vous J-24h et J-1h | Cron NestJS Scheduler |
| `invoice-queue` | Génération PDF de facture | Paiement validé |
| `cleanup-queue` | Fermeture des salles Jitsi expirées | Cron toutes les 15 min |

L'avantage de cette architecture asynchrone est de ne jamais bloquer la réponse HTTP : quand un patient réserve un rendez-vous, l'API répond immédiatement `201 Created`, et les emails sont envoyés en arrière-plan par les workers BullMQ.

---

### 3.2.6 Messagerie Temps Réel : Socket.io

Socket.io implémente le protocole WebSocket avec une couche de compatibilité qui bascule automatiquement vers le long-polling HTTP si WebSocket n'est pas disponible (certains réseaux d'entreprise bloquent WebSocket).

**Architecture de la messagerie Monpsy :**

```
Patient          Socket.io Server (NestJS Gateway)        Redis Pub/Sub
   │                        │                                   │
   │──[connect: {token}]──→ │                                   │
   │                        │── Vérifie JWT ──→                 │
   │                        │── Join room: "user:{userId}" →    │
   │                        │                                   │
   │──[emit: send_message]→ │                                   │
   │                        │── Chiffre contenu (AES-256) →     │
   │                        │── Sauvegarde en DB ──→             │
   │                        │── Publish "msg:{conversationId}"] →│
   │                        │                         ←─ Subscribe│
   │                        │←─[emit: receive_message]           │
Psychologue                 │                                   │
   │←─[receive_message]─────│                                   │
```

Chaque message est **chiffré en AES-256-GCM** avant d'être stocké en base de données. Même en cas de brèche, le contenu des conversations est illisible sans la clé de déchiffrement.

---

### 3.2.7 Stockage de Fichiers : MinIO (Compatible S3)

| Critère | **MinIO** ✅ | AWS S3 | Cloudinary | Système de fichiers local |
|---|---|---|---|---|
| **Coût** | Gratuit (auto-hébergé) | ~0.023$/Go/mois | Limité (free tier) | Gratuit mais risqué |
| **Compatibilité S3** | 100% API S3 | Natif | Non | Non |
| **Chiffrement au repos** | Oui (AES-256) | Oui | Oui | Non |
| **Accès signé (presigned URLs)** | Oui | Oui | Oui | Non |
| **Auto-hébergeable** | Oui | Non | Non | Oui |
| **Souveraineté des données** | Totale (serveur tunisien) | Non (USA) | Non | Oui |

**Décision retenue : MinIO**

MinIO est une solution de stockage objet open source 100% compatible avec l'API AWS S3. Cela signifie que si Monpsy décide de migrer vers AWS S3 à l'avenir (croissance), il suffit de changer deux variables d'environnement sans modifier une seule ligne de code.

Les documents médicaux (diplômes, ordonnances, comptes-rendus) sont accessibles via des **URLs présignées** (presigned URLs) à durée limitée : un lien généré pour un document expire en 15 minutes, ce qui empêche tout partage non autorisé même si l'URL est interceptée.

---

## 3.3 Architecture de Sécurité Multicouche

La sécurité d'une plateforme médicale ne peut pas être une réflexion a posteriori. Elle doit être **intégrée by design** à chaque couche du système.

### 3.3.1 Authentification JWT avec Rotation de Tokens

```
┌──────────────┐         ┌─────────────────┐         ┌──────────────┐
│   Frontend   │         │   API NestJS    │         │    Redis     │
│──────────────│         │─────────────────│         │──────────────│
│ Login ──────────────→  │ Vérifie bcrypt  │         │              │
│              │         │ Génère:         │         │              │
│              │         │  accessToken    │         │              │
│              │         │  (TTL: 15 min)  │         │              │
│              │         │  refreshToken   │         │              │
│              │         │  (TTL: 7 jours) │         │              │
│              │ ←─────── │ HttpOnly Cookie │         │              │
│              │         │                 │         │              │
│ API Request ──────────→ │ Vérifie AT      │         │              │
│              │         │ AT expiré ? ────────────→ │ Vérifie RT   │
│              │         │                 │ ←─────── │ RT valide ?  │
│              │         │ Génère nouveau AT          │              │
│              │ ←─────── │ Retourne données│         │              │
│              │         │                 │         │              │
│ Logout ─────────────→  │ Blacklist JTI ──────────→ │ SET blacklist│
│              │         │                 │         │ (TTL: 7j)    │
```

**Sécurité des cookies :**
- `HttpOnly: true` → Inaccessible depuis JavaScript (protection XSS)
- `Secure: true` → Transmis uniquement via HTTPS
- `SameSite: Strict` → Protection CSRF

### 3.3.2 Double Authentification (2FA TOTP)

L'implémentation du 2FA utilise le standard **TOTP** (Time-based One-Time Password, RFC 6238), compatible avec Google Authenticator, Authy et tout autre application d'authentification :

```typescript
// Activation du 2FA (backend NestJS)
async enable2FA(userId: string): Promise<{ secret: string; qrCode: string }> {
  const secret = speakeasy.generateSecret({
    name: `Monpsy:${user.email}`,
    length: 20,
  });
  // Le secret est chiffré (AES-256) avant stockage en base
  const encryptedSecret = this.crypto.encrypt(secret.base32);
  await this.prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: encryptedSecret },
  });
  // Retourne un QR code scannable
  const qrCode = await QRCode.toDataURL(secret.otpauth_url!);
  return { secret: secret.base32, qrCode };
}
```

### 3.3.3 Hachage des Mots de Passe (bcrypt)

```typescript
// Les mots de passe ne sont JAMAIS stockés en clair
const saltRounds = 12; // 2^12 = 4096 itérations de hachage
const hashedPassword = await bcrypt.hash(plainTextPassword, saltRounds);

// Vérification
const isValid = await bcrypt.compare(plainTextPassword, hashedPassword);
```

Le coût (saltRounds) de 12 est calibré pour résister aux attaques par force brute modernes : avec un GPU récent, casser un seul hash bcrypt-12 prendrait théoriquement des centaines d'années.

### 3.3.4 Protection des Endpoints (Guards NestJS)

```typescript
// Exemple : Protection d'un endpoint sensible
@Get('profile')
@UseGuards(JwtAuthGuard, RolesGuard)  // Double protection
@Roles(UserRole.PATIENT)              // Rôle requis
async getProfile(@CurrentUser() user: JwtPayload) {
  return this.patientsService.findByUserId(user.sub);
}
```

Le `ThrottlerGuard` limite les tentatives de connexion à **5 tentatives par 15 secondes** par IP, protégeant contre les attaques par force brute sur le formulaire de login.

---

## 3.4 Conception du Module de Paiement — Strategy Pattern

Le module de paiement implémente le **Design Pattern Strategy** (patron de conception comportemental), qui permet d'interchanger facilement les algorithmes (passerelles de paiement) sans modifier le code appelant.

### 3.4.1 Diagramme du Pattern Strategy

```
┌─────────────────┐        ┌──────────────────────────────────────────┐
│ PaymentsService │        │          <<interface>>                   │
│ (Context)       │───────→│         IPaymentStrategy                 │
│                 │        │──────────────────────────────────────────│
│ - strategy      │        │ + initiate(amount, meta): Promise<Result>│
│                 │        │ + verifyWebhook(headers, body): boolean  │
│ + initiate()    │        │ + refund(paymentId): Promise<void>       │
│ + handleWebhook │        └──────────────────────────────────────────┘
└─────────────────┘                        ▲
         │                                 │ implements
         │                    ┌────────────┼────────────┐
         │                    │            │            │
┌──────────────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────────┐
│ KonnectStrategy  │  │FlouciStrategy│  │ Paymee   │  │StripeStrategy│
│──────────────────│  │─────────────│  │ Strategy │  │──────────────│
│ (Marché TND)     │  │(Wallet TN)  │  │(Lien pay)│  │(International│
└──────────────────┘  └─────────────┘  └──────────┘  └──────────────┘
```

### 3.4.2 Sélection Dynamique de la Stratégie

```typescript
// PaymentFactory — Sélection de la bonne stratégie au runtime
@Injectable()
export class PaymentFactory {
  constructor(
    private readonly konnect: KonnectStrategy,
    private readonly flouci: FlouciStrategy,
    private readonly stripe: StripeStrategy,
  ) {}

  getStrategy(provider: PaymentProvider): IPaymentStrategy {
    const strategies: Record<PaymentProvider, IPaymentStrategy> = {
      KONNECT: this.konnect,
      FLOUCI: this.flouci,
      STRIPE: this.stripe,
    };
    const strategy = strategies[provider];
    if (!strategy) throw new BadRequestException(`Provider ${provider} non supporté`);
    return strategy;
  }
}
```

L'avantage majeur de ce pattern : pour ajouter une nouvelle passerelle de paiement (ex: SOBFLOUS), il suffit de créer une nouvelle classe `SobflousStrategy` qui implémente `IPaymentStrategy` et de l'enregistrer dans la factory. Aucune modification du code existant n'est nécessaire (principe Open/Closed de SOLID).

---

## 3.5 Conception de la Base de Données (Schéma Prisma)

### 3.5.1 Extrait du Schéma Prisma — Entités Clés

```prisma
// Entité centrale : User
model User {
  id                String    @id @default(uuid())
  email             String    @unique
  passwordHash      String
  role              UserRole  @default(PATIENT)
  isEmailVerified   Boolean   @default(false)
  isTwoFactorEnabled Boolean  @default(false)
  twoFactorSecret   String?   // Chiffré AES-256
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  patient           Patient?
  psychologist      Psychologist?
}

// Entité Rendez-vous
model Appointment {
  id              String            @id @default(uuid())
  patientId       String
  psychologistId  String
  startAt         DateTime          // Stocké en UTC
  endAt           DateTime
  status          AppointmentStatus @default(PENDING)
  paymentId       String?
  timezone        String            @default("Africa/Tunis")
  createdAt       DateTime          @default(now())

  patient         Patient           @relation(fields: [patientId], references: [id])
  psychologist    Psychologist      @relation(fields: [psychologistId], references: [id])
  payment         Payment?          @relation(fields: [paymentId], references: [id])
  meetingRoom     MeetingRoom?

  @@index([patientId, startAt])         // Optimisation : recherche par patient et date
  @@index([psychologistId, startAt])    // Optimisation : recherche par praticien et date
}

// Salle de visioconférence
model MeetingRoom {
  id            String            @id @default(uuid())
  appointmentId String            @unique
  roomName      String            @unique  // monpsy-session-{uuid}-{16hex}
  password      String                     // Entropy supplémentaire
  status        MeetingRoomStatus @default(ACTIVE)
  expiresAt     DateTime
  createdAt     DateTime          @default(now())

  appointment   Appointment       @relation(fields: [appointmentId], references: [id])
  participants  MeetingParticipant[]
  logs          MeetingLog[]
}
```

### 3.5.2 Indexation et Optimisation des Requêtes

Les index de base de données ont été définis de façon stratégique pour optimiser les requêtes les plus fréquentes :

| Index | Table | Colonnes | Usage |
|---|---|---|---|
| Composite | Appointment | `(psychologistId, startAt)` | Détection de conflits horaires |
| Composite | Appointment | `(patientId, startAt)` | Historique du patient |
| Composite | AvailabilitySlot | `(psychologistId, dayOfWeek)` | Calendrier hebdomadaire |
| Unique | MeetingRoom | `roomName` | Accès à une salle par son nom |
| Index | Message | `conversationId` | Chargement des messages d'une conversation |

---

## 3.6 Architecture de Déploiement

### 3.6.1 Infrastructure Cible (Environnement de Production)

```
Internet
    │
    ▼
┌─────────────┐
│ Vercel CDN  │  ← Frontend Next.js (Edge Network mondial)
│ (Frontend)  │
└─────────────┘
    │ API Calls (HTTPS)
    ▼
┌─────────────────────────────────────────────┐
│              VPS Ubuntu 22.04               │
│─────────────────────────────────────────────│
│  ┌─────────────────────────────────────┐   │
│  │       Nginx (Port 443/HTTPS)        │   │
│  │   SSL via Let's Encrypt (Certbot)   │   │
│  │   Rate limiting: 100 req/min/IP     │   │
│  └─────────────┬───────────────────────┘   │
│                │ Reverse Proxy              │
│       ┌────────┴────────────┐              │
│       ▼                     ▼              │
│  ┌─────────┐          ┌──────────┐         │
│  │NestJS   │          │MinIO     │         │
│  │:3000    │          │:9000     │         │
│  └────┬────┘          └──────────┘         │
│       │                                    │
│  ┌────┴──────────────────┐                │
│  │  PostgreSQL :5432     │                │
│  │  Redis :6379           │                │
│  └───────────────────────┘                │
└─────────────────────────────────────────────┘
```

### 3.6.2 Pipeline CI/CD (GitHub Actions)

```yaml
# Déclenchement : Push sur la branche main
on:
  push:
    branches: [main]

jobs:
  # Étape 1 : Vérification de la qualité du code
  lint-and-test:
    - npm run lint          # ESLint : vérification des règles de code
    - npm run test          # Jest : tests unitaires
    - npm run test:e2e      # Supertest : tests d'intégration API

  # Étape 2 : Build de production
  build:
    - npm run build         # Compilation TypeScript → JavaScript

  # Étape 3 : Déploiement automatique
  deploy:
    - Vercel CLI deploy     # Frontend : déploiement automatique sur Vercel
    - SSH VPS + docker-compose up   # Backend : déploiement sur VPS
```

### 3.6.3 Conteneurisation Docker

Chaque service de la stack est conteneurisé dans un conteneur Docker indépendant, orchestré par Docker Compose :

```yaml
services:
  nestjs:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://user:pass@postgres:5432/monpsy
      REDIS_URL: redis://redis:6379
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16-alpine
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

  minio:
    image: minio/minio
    command: server /data
    volumes: [minio_data:/data]

  nginx:
    image: nginx:alpine
    volumes: [./nginx.conf:/etc/nginx/nginx.conf:ro]
    ports: ["443:443", "80:80"]
```

---

## Conclusion du Chapitre 3

Ce chapitre a présenté l'ensemble des décisions architecturales et techniques qui fondent la plateforme Monpsy. L'architecture en couches N-Tiers, la modularité NestJS, le choix de PostgreSQL/Prisma pour l'intégrité des données médicales, l'utilisation de Next.js 15 pour un SEO optimal, l'intégration gratuite de Jitsi Meet pour la viabilité économique, et la sécurité multicouche (JWT, bcrypt-12, 2FA, AES-256) forment un ensemble cohérent et argumenté. Chaque choix répond à une contrainte métier, technique ou économique précise, et a été préféré à ses alternatives après une analyse comparative rigoureuse.

Le Design Pattern Strategy pour le module de paiement et l'architecture BullMQ pour les tâches asynchrones démontrent l'application concrète des bonnes pratiques de génie logiciel dans un projet réel.

Le chapitre suivant présentera les réalisations concrètes issues de ces choix architecturaux, avec des extraits de code réels, des captures d'écran de l'interface, et les résultats des tests de validation.

---

*Fin du Chapitre 3 — Prochain : Chapitre 4 (Réalisation et Tests)*
