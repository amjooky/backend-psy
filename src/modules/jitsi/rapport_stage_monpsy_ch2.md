# RAPPORT DE STAGE — PROJET MONPSY
## Plateforme de Psychothérapie en Ligne Sécurisée

---

# CHAPITRE 2 — ANALYSE ET SPÉCIFICATION DES BESOINS

---

## Introduction du chapitre

Après avoir établi le contexte général du projet dans le Chapitre 1, ce deuxième chapitre formalise rigoureusement les besoins fonctionnels et techniques de la plateforme Monpsy. Cette phase d'analyse est fondamentale : elle constitue le contrat entre les développeurs et les parties prenantes, définit les comportements attendus du système, et pose les bases de toutes les décisions d'architecture qui suivront. La modélisation adoptée suit les standards UML (Unified Modeling Language), reconnus dans l'industrie du développement logiciel.

---

## 2.1 Identification des Acteurs du Système

Un acteur représente toute entité externe interagissant avec le système. L'analyse des besoins de Monpsy a révélé **quatre acteurs principaux** distincts, chacun ayant un profil, des droits et des objectifs différents.

### 2.1.1 Tableau des Acteurs

| Acteur | Type | Description | Accès |
|---|---|---|---|
| **Patient** | Acteur primaire | Utilisateur final cherchant un suivi psychologique. Peut être en mode nominatif ou totalement anonyme (pseudo uniquement). | Dashboard patient, profils psychologues, réservation, messagerie, vidéo |
| **Psychologue** | Acteur primaire | Professionnel de santé mentale agréé inscrit sur la plateforme. Son profil est public. | Dashboard praticien, gestion calendrier, consultation vidéo, messagerie, documents |
| **Administrateur** | Acteur secondaire | Gestionnaire de la plateforme chargé de valider les inscriptions des psychologues (KYC) et de modérer les avis. | Back-office admin, vérification KYC, gestion financière |
| **Super-Administrateur** | Acteur système | Accès total à toutes les fonctionnalités. Peut gérer les administrateurs, modifier les paramètres système, accéder aux logs d'audit. | Toutes les fonctionnalités + configuration système |

### 2.1.2 Hiérarchie des Rôles (RBAC)

Le système implémente un contrôle d'accès basé sur les rôles (Role-Based Access Control — RBAC). La hiérarchie est la suivante :

```
SUPER_ADMIN
    └── ADMIN
            └── PSYCHOLOGUE  ←→  PATIENT
```

Chaque rôle hérite des permissions du rôle inférieur dans la hiérarchie. PSYCHOLOGUE et PATIENT sont au même niveau mais ont des périmètres d'accès entièrement distincts.

---

## 2.2 Diagramme de Cas d'Utilisation Global

Le diagramme ci-dessous (à reproduire dans draw.io ou StarUML) représente l'ensemble des interactions entre les acteurs et le système Monpsy.

```
╔══════════════════════════════════════════════════════════════╗
║                     SYSTÈME MONPSY                           ║
║                                                              ║
║   [S'inscrire / Se connecter]  ←── PATIENT ──→ [Rechercher un psychologue]
║   [Réserver un rendez-vous]    ←── PATIENT ──→ [Payer une consultation]
║   [Rejoindre une visioconférence] ←─ PATIENT ─→ [Envoyer un message]
║   [Évaluer un psychologue]     ←── PATIENT                   ║
║                                                              ║
║   [Gérer son calendrier]       ←── PSYCHOLOGUE               ║
║   [Valider une réservation]    ←── PSYCHOLOGUE               ║
║   [Lancer une consultation]    ←── PSYCHOLOGUE               ║
║   [Uploader ses documents]     ←── PSYCHOLOGUE               ║
║                                                              ║
║   [Vérifier les diplômes (KYC)] ←── ADMIN                   ║
║   [Gérer les avis]             ←── ADMIN                     ║
║   [Suivre les paiements]       ←── ADMIN                     ║
║                                                              ║
║   [Configurer le système]      ←── SUPER_ADMIN               ║
║   [Consulter les logs d'audit] ←── SUPER_ADMIN               ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 2.3 Cas d'Utilisation Détaillés

### CU-01 — Inscription d'un Patient

| Champ | Détail |
|---|---|
| **Identifiant** | CU-01 |
| **Nom** | Inscription d'un patient |
| **Acteur principal** | Patient (non connecté) |
| **Pré-conditions** | L'utilisateur n'a pas encore de compte sur la plateforme |
| **Post-conditions** | Un compte patient est créé, un email de vérification est envoyé |
| **Déclencheur** | L'utilisateur clique sur "Créer un compte" sur la landing page |

**Scénario nominal :**
1. L'utilisateur accède à la page d'inscription.
2. Il choisit entre deux modes : **Inscription nominative** (avec nom, prénom, email) ou **Mode anonyme** (avec un pseudo uniquement).
3. Il saisit son mot de passe (minimum 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial).
4. Il accepte les conditions générales d'utilisation et la politique de confidentialité.
5. Il soumet le formulaire.
6. Le système vérifie l'unicité de l'email (ou du pseudo en mode anonyme).
7. Le système crée le compte, hache le mot de passe avec bcrypt (saltRounds=12).
8. Le système génère un token de vérification d'email (UUID v4, TTL 24h, stocké dans Redis).
9. Le système envoie un email de vérification via Nodemailer.
10. L'utilisateur est redirigé vers une page de confirmation.

**Scénarios alternatifs :**
- **3a** : Email déjà utilisé → Le système affiche "Cet email est déjà associé à un compte. Connectez-vous."
- **3b** : Mode anonyme, pseudo déjà pris → Le système suggère des variantes disponibles.
- **8a** : L'utilisateur ne vérifie pas son email dans les 24h → Le token expire. Il peut demander un renvoi.

**Règles de gestion :**
- RG-01 : En mode anonyme, un email fictif est généré automatiquement : `{pseudo}@anonymous.monpsy.tn`
- RG-02 : Une clé de récupération est générée et affichée une seule fois pour les comptes anonymes (permet de récupérer l'accès sans email).

---

### CU-02 — Réservation d'un Rendez-Vous

| Champ | Détail |
|---|---|
| **Identifiant** | CU-02 |
| **Nom** | Réservation d'une consultation |
| **Acteur principal** | Patient (connecté et vérifié) |
| **Pré-conditions** | Patient connecté, psychologue sélectionné, créneau visible dans le calendrier |
| **Post-conditions** | Rendez-vous créé avec statut PENDING, notifications envoyées aux deux parties |
| **Déclencheur** | Le patient clique sur un créneau disponible dans le calendrier du psychologue |

**Scénario nominal :**
1. Le patient consulte la liste des psychologues (filtres disponibles : spécialité, langue, tarif, disponibilité, note).
2. Il sélectionne un profil et accède au calendrier de disponibilité du praticien.
3. Il clique sur un créneau libre.
4. Le système vérifie en temps réel (via Redis) que le créneau n'a pas été pris entre-temps (protection contre les conditions de course).
5. Le système vérifie que le patient n'a pas déjà un rendez-vous à ce même horaire (détection de conflits).
6. Le système crée le rendez-vous avec le statut `PENDING`.
7. Le système envoie une notification Socket.io au psychologue (temps réel) et un email de confirmation au patient.
8. Le psychologue reçoit la demande dans son dashboard et peut **Accepter** ou **Refuser** dans les 24 heures.
9. Si accepté → statut passe à `CONFIRMED`, le patient est notifié.
10. Si refusé ou aucune réponse sous 24h → statut passe à `CANCELLED`, le patient est notifié.

**Règles de gestion :**
- RG-03 : Un rendez-vous ne peut être réservé qu'avec un minimum de 2 heures d'avance.
- RG-04 : La durée d'une séance est fixée par le psychologue (variable de 30 à 90 minutes).
- RG-05 : Le paiement est exigé avant la confirmation définitive (voir CU-04).
- RG-06 : Les fuseaux horaires sont automatiquement convertis selon le profil de chaque utilisateur (librairie Luxon).

**Machine à états du Rendez-Vous :**
```
PENDING → CONFIRMED → IN_PROGRESS → COMPLETED
   ↓           ↓
CANCELLED   CANCELLED
              ↓
         NO_SHOW (si le patient ne se connecte pas)
```

---

### CU-03 — Inscription d'un Psychologue et Validation KYC

| Champ | Détail |
|---|---|
| **Identifiant** | CU-03 |
| **Nom** | Inscription psychologue + vérification KYC |
| **Acteur principal** | Psychologue (inscription) + Administrateur (validation) |
| **Pré-conditions** | Le psychologue possède un diplôme en psychologie clinique reconnu |
| **Post-conditions** | Le profil est visible publiquement, le psychologue peut recevoir des réservations |

**Scénario nominal :**
1. Le psychologue s'inscrit via un formulaire dédié (informations professionnelles, spécialités, langues parlées, tarif, biographie).
2. Il uploade ses documents justificatifs (diplôme, carte d'identité professionnelle, autorisation d'exercice) via MinIO (stockage S3-compatible sécurisé).
3. Son compte passe au statut `PENDING_VERIFICATION`.
4. Un administrateur est notifié de la nouvelle demande.
5. L'administrateur consulte les documents via le back-office et prend une décision.
6. Si **VALIDÉ** → statut passe à `VERIFIED`, le profil devient public, le psychologue reçoit un email de bienvenue.
7. Si **REJETÉ** → l'administrateur saisit un motif, le psychologue est notifié par email avec les corrections attendues.

---

### CU-04 — Paiement d'une Consultation

| Champ | Détail |
|---|---|
| **Identifiant** | CU-04 |
| **Nom** | Paiement sécurisé d'une consultation |
| **Acteur principal** | Patient |
| **Pré-conditions** | Rendez-vous créé (statut PENDING), patient connecté |
| **Post-conditions** | Paiement enregistré, rendez-vous confirmé, facture générée en PDF |

**Scénario nominal :**
1. Après la sélection d'un créneau, le patient est redirigé vers la page de paiement.
2. Il choisit sa méthode de paiement parmi les options disponibles :
   - **Konnect** (paiement en TND, intégré localement, pas besoin de carte internationale)
   - **Flouci** (wallet mobile tunisien)
   - **Paymee** (paiement par lien, compatible banques tunisiennes)
   - **Stripe** (pour les patients de la diaspora avec carte Visa/Mastercard internationale)
3. Il est redirigé vers la page de paiement sécurisée de la passerelle choisie.
4. La passerelle notifie le backend via un **webhook HTTP POST** (endpoint sécurisé par signature HMAC).
5. Le backend valide la signature du webhook, met à jour le statut du paiement à `PAID`.
6. Le rendez-vous passe au statut `CONFIRMED`.
7. Une facture PDF est générée automatiquement et envoyée par email au patient.

**Règles de gestion :**
- RG-07 : Aucun numéro de carte bancaire n'est stocké dans la base de données Monpsy (conformité PCI-DSS).
- RG-08 : En cas d'annulation par le psychologue, le remboursement est automatiquement initié sous 48h.
- RG-09 : La commission de la plateforme est prélevée automatiquement sur chaque transaction (pourcentage configurable par l'administrateur).

---

### CU-05 — Déroulement d'une Consultation Vidéo

| Champ | Détail |
|---|---|
| **Identifiant** | CU-05 |
| **Nom** | Consultation par visioconférence sécurisée |
| **Acteur principal** | Psychologue (modérateur) + Patient (participant) |
| **Pré-conditions** | Rendez-vous confirmé et payé, dans la fenêtre de temps autorisée |
| **Post-conditions** | Salle fermée, durée enregistrée, séance marquée COMPLETED |

**Scénario nominal :**
1. Le psychologue accède à son dashboard et clique sur "Démarrer la séance" pour le rendez-vous concerné.
2. Le backend génère un nom de salle aléatoire sécurisé : `monpsy-session-{appointmentId}-{16 octets hex}`.
3. Une entrée `MeetingRoom` est créée dans la base de données avec le statut `ACTIVE`.
4. Le psychologue reçoit un token JWT Jitsi avec le rôle **modérateur** (`isModerator: true`).
5. La salle Jitsi s'ouvre dans un IFrame intégré à la page (Jitsi External API).
6. Le patient tente de rejoindre la salle depuis son dashboard.
7. Le backend vérifie que le psychologue est déjà dans la salle (présence enregistrée dans `MeetingParticipant`).
8. Si le psychologue est présent → le patient reçoit son token JWT avec le rôle **participant**.
9. Si le psychologue n'est pas encore là → le backend retourne une erreur 400 avec le message "Le praticien n'a pas encore lancé la séance. Veuillez patienter."
10. La séance se déroule. À la fermeture, les deux participants sont enregistrés dans les logs (`MeetingLog`).
11. Le rendez-vous passe au statut `COMPLETED`.

**Règles de gestion :**
- RG-10 : La salle expire automatiquement 30 minutes après l'heure de fin prévue.
- RG-11 : Le patient peut rejoindre jusqu'à 120 minutes avant l'heure de début (accès anticipé).
- RG-12 : L'accès est révoqué 6 heures après l'heure de fin (sécurité).
- RG-13 : Si la connexion est perdue, le patient peut rejoindre sans renouveler de token pendant 6 heures.

---

## 2.4 Diagrammes de Séquence des Flux Critiques

### 2.4.1 Séquence : Authentification avec 2FA

```
Patient        Frontend        API /auth/login     Redis          Email SMTP
  │               │                  │               │               │
  │──[POST email+pwd]──────────────→ │               │               │
  │               │    Vérif. bcrypt │               │               │
  │               │←──[200: {2fa_required: true}]   │               │
  │               │                  │               │               │
  │──[Saisit code TOTP]─────────────→│               │               │
  │               │    Vérifie TOTP  │               │               │
  │               │    speakeasy     │               │               │
  │               │←──[200: {accessToken, refreshToken}]            │
  │←──[Redirigé vers Dashboard]      │               │               │
```

### 2.4.2 Séquence : Réservation Complète (Booking Flow)

```
Patient      Frontend      API /appointments      Redis       Notif. Service
  │             │                 │                 │               │
  │─[Sélect créneau]────────────→ │                 │               │
  │             │  Lock créneau   │─[SET slot:lock]→ │               │
  │             │  (TTL 5 min)    │                 │               │
  │             │  Vérifie conflit│                 │               │
  │             │←─[201: appointment{id, PENDING}]  │               │
  │             │                 │──[Notif push + email Psy]──────→│
  │←[Page paiement]              │                 │               │
  │─[Paiement Konnect]──────────→ │                 │               │
  │             │ webhook HMAC    │                 │               │
  │             │ validation      │                 │               │
  │             │  Update CONFIRMED                 │               │
  │             │←─[PDF facture]  │──[Email patient + psy]─────────→│
  │←[Confirmation écran]         │                 │               │
```

### 2.4.3 Séquence : Accès à la Salle Jitsi (Consultation Vidéo)

```
Psychologue   Frontend    API /jitsi/access    DB (Prisma)    Jitsi meet.ffmuc.net
    │             │               │                │                │
    │─[Démarrer séance]──────────→│                │                │
    │             │ Crée MeetingRoom               │                │
    │             │               │──[INSERT MeetingRoom]──────────→│
    │             │               │  Génère JWT mod │                │
    │             │←─[roomName, token_JWT]         │                │
    │←[IFrame Jitsi ouvert, modérateur]           │                │
    │             │               │                │                │
Patient       Frontend    API /jitsi/access    DB (Prisma)
    │             │               │                │
    │─[Rejoindre séance]─────────→│                │
    │             │ Vérifie psy présent            │
    │             │               │──[SELECT MeetingParticipant]───→│
    │             │               │←─[Psy trouvé]  │                │
    │             │  Génère JWT participant         │                │
    │             │←─[roomName, token_JWT]         │                │
    │←[IFrame Jitsi, participant] │                │                │
```

---

## 2.5 Modèle du Domaine — Diagramme de Classes Simplifié

### 2.5.1 Entités Principales et Relations

```
┌─────────────┐          ┌──────────────┐          ┌──────────────────┐
│    USER      │1        1│  PATIENT     │1        N│  APPOINTMENT     │
│─────────────│──────────│──────────────│──────────│──────────────────│
│ id (uuid)   │          │ id (uuid)    │          │ id (uuid)        │
│ email       │          │ userId (fk)  │          │ patientId (fk)   │
│ passwordHash│          │ firstName    │          │ psychologistId(fk)│
│ role (enum) │          │ lastName     │          │ startAt (datetime)│
│ isVerified  │          │ isAnonymous  │          │ endAt (datetime)  │
│ createdAt   │          │ anonymousName│          │ status (enum)     │
└─────────────┘          │ timezone     │          │ paymentId (fk)   │
        │                └──────────────┘          └──────────────────┘
        │                                                    │
        │1                                                   │1
        │                                          ┌──────────────────┐
┌──────────────────┐                               │  MEETING_ROOM    │
│  PSYCHOLOGIST    │                               │──────────────────│
│──────────────────│                               │ id (uuid)        │
│ id (uuid)        │                               │ roomName (unique)│
│ userId (fk)      │                               │ password (hex)   │
│ status (enum)    │                               │ status (enum)    │
│ specialties[]    │                               │ expiresAt        │
│ sessionPrice     │     ┌──────────────┐          └──────────────────┘
│ sessionDuration  │1   N│ AVAILABILITY │                    │N
│ timezone         │─────│ SLOT         │          ┌──────────────────┐
│ verifiedAt       │     │──────────────│          │MEETING_PARTICIPANT│
└──────────────────┘     │ dayOfWeek    │          │──────────────────│
                         │ startTime    │          │ userId (fk)      │
                         │ endTime      │          │ role (mod/parti) │
                         └──────────────┘          │ joinedAt         │
                                                   └──────────────────┘
```

### 2.5.2 Entités Secondaires Importantes

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   PAYMENT    │    │   MESSAGE    │    │   DOCUMENT   │    │   REVIEW     │
│──────────────│    │──────────────│    │──────────────│    │──────────────│
│ id           │    │ id           │    │ id           │    │ id           │
│ amount (TND) │    │ senderId(fk) │    │ ownerId(fk)  │    │ patientId    │
│ currency     │    │ receiverId   │    │ fileKey(minio│    │ psychoId     │
│ provider(enum│    │ content(enc) │    │ type (enum)  │    │ rating (1-5) │
│ status(enum) │    │ isRead       │    │ isPrivate    │    │ comment      │
│ webhookData  │    │ createdAt    │    │ expiresAt    │    │ isVerified   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## 2.6 Règles de Gestion Métier Synthétiques

| Code | Domaine | Règle |
|---|---|---|
| **RG-01** | Authentification | Mode anonyme : email auto-généré `{pseudo}@anonymous.monpsy.tn` |
| **RG-02** | Authentification | Clé de récupération de 32 caractères générée une seule fois pour les comptes anonymes |
| **RG-03** | Rendez-vous | Réservation minimale 2 heures avant le début de la séance |
| **RG-04** | Rendez-vous | Durée de séance : entre 30 et 90 minutes, définie par le psychologue |
| **RG-05** | Rendez-vous | Le paiement est obligatoire avant confirmation du rendez-vous |
| **RG-06** | Rendez-vous | Fuseaux horaires convertis automatiquement (Luxon) en UTC en base de données |
| **RG-07** | Paiement | Aucune donnée bancaire stockée sur les serveurs Monpsy (PCI-DSS) |
| **RG-08** | Paiement | Remboursement automatique déclenché en cas d'annulation du psychologue |
| **RG-09** | Paiement | Commission plateforme configurable et prélevée automatiquement |
| **RG-10** | Visioconférence | Salle expire 30 minutes après l'heure de fin prévue |
| **RG-11** | Visioconférence | Accès anticipé possible 120 minutes avant le début |
| **RG-12** | Visioconférence | Accès révoqué 6 heures après l'heure de fin (sécurité) |
| **RG-13** | Visioconférence | Le patient ne peut rejoindre que si le psychologue a déjà lancé la salle |
| **RG-14** | Documents | Fichiers chiffrés en transit (HTTPS/TLS 1.3) et au repos (MinIO encryption) |
| **RG-15** | Avis | Un avis ne peut être posté qu'après une séance COMPLETED |
| **RG-16** | KYC | Un psychologue ne peut recevoir de réservations qu'avec le statut `VERIFIED` |

---

## 2.7 Contraintes Réglementaires et Légales

### 2.7.1 INPDP — Instance Nationale de Protection des Données Personnelles (Tunisie)

La loi tunisienne n°2004-63 du 27 juillet 2004 portant sur la protection des données à caractère personnel impose des obligations strictes que Monpsy respecte intégralement :

- **Finalité déclarée** : Les données collectées sont utilisées exclusivement pour la mise en relation patient-psychologue et ne sont jamais revendues à des tiers.
- **Droit à l'effacement** : Tout utilisateur peut demander la suppression définitive de son compte et de l'ensemble de ses données.
- **Consentement explicite** : L'acceptation des CGU et de la politique de confidentialité est obligatoire à l'inscription, avec horodatage enregistré.
- **Minimisation des données** : Seules les données strictement nécessaires sont collectées (le mode anonyme en est l'illustration directe).

### 2.7.2 RGPD — Règlement Général sur la Protection des Données (Europe)

Bien que Monpsy soit une plateforme tunisienne, sa vocation internationale (diaspora en France, Belgique) impose le respect du RGPD pour tout utilisateur résidant dans l'Union Européenne :

- **Droit à la portabilité** : Export des données personnelles en format JSON disponible dans les paramètres du compte.
- **Notification de violation** : En cas de brèche de sécurité, les utilisateurs sont notifiés sous 72 heures (Article 33 RGPD).
- **DPO** : Un Délégué à la Protection des Données est désigné en interne.

### 2.7.3 Secret Médical Numérique

Toutes les communications entre patients et psychologues sont protégées par le secret médical :
- Les messages sont chiffrés de bout en bout (AES-256-GCM).
- Les documents médicaux sont accessibles uniquement par le patient concerné et son praticien référent.
- Aucun employé de Monpsy n'a accès au contenu des séances ou des messages.

---

## Conclusion du Chapitre 2

Ce chapitre a permis de formaliser l'ensemble des besoins fonctionnels et non fonctionnels de la plateforme Monpsy à travers des diagrammes UML structurés, des cas d'utilisation détaillés, des diagrammes de séquence et un modèle de domaine complet. Les 16 règles de gestion métier identifiées constituent le référentiel fonctionnel qui a guidé chaque décision de développement. Les contraintes réglementaires (INPDP, RGPD, secret médical) ont été intégrées dès cette phase d'analyse, conformément au principe de "Privacy by Design".

Le chapitre suivant présentera comment ces besoins ont été traduits en une architecture technique cohérente, scalable et sécurisée, en justifiant chaque choix technologique de la stack utilisée.

---

*Fin du Chapitre 2 — Prochain : Chapitre 3 (Conception et Architecture Technique)*
