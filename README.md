# Inventory MDB

Plateforme professionnelle de gestion d'inventaire et de contrôle du **food cost** pour un restaurant à deux succursales (V1 : **inventaire global**, sans séparation par branche).

> **Formule centrale**
> `realCost = openingValue + purchasesValue − closingValue`
> `foodCostPercentage = realCost / salesRevenue × 100` (si CA renseigné)

---

## Stack

**Frontend** — React 18 · Vite · TypeScript · Tailwind · shadcn/ui · React Query · Zustand · React Hook Form · Zod · Recharts
**Backend** — NestJS 10 · TypeScript · Prisma · PostgreSQL · JWT · RBAC · Swagger · ExcelJS · Puppeteer · Audit logs
**Shared** — Zod schemas, enums et types partagés via `@inventorymdb/shared`

---

## Architecture monorepo

```
inventorymdb/
├── apps/
│   ├── backend/         # NestJS API
│   └── frontend/        # React + Vite
├── packages/
│   └── shared/          # enums, types, Zod schemas
├── docs/
│   └── diagrams/        # PlantUML (use-case, class, sequence, activity)
├── docker-compose.yml   # PostgreSQL + pgAdmin
└── README.md
```

### Modules backend (NestJS)
`auth` · `users` · `categories` · `products` · `suppliers` · `purchases` · `inventory-periods` · `inventory-lines` · `dashboard` · `reports` · `exports` · `audit-logs` · `common`

### Pages frontend
`Login` · `Dashboard` · `Products` · `Categories` · `Suppliers` · `Purchases` · `InventoryPeriods` · `InventoryDetail` · `Reports` · `Settings`

---

## Règles métier clés

- Un seul inventaire global (pas de `branch_id` en V1).
- Chaque mois = une `InventoryPeriod` (`OPEN` ou `CLOSED`).
- Une période `CLOSED` n'est plus modifiable, **sauf** par un `ADMIN`.
- À la clôture :
  1. agrégation des achats du mois par produit ;
  2. calcul de la consommation par ligne (qty & valeur) ;
  3. génération de `InventoryReport` (opening / purchases / closing / realCost / sales / foodCost %) ;
  4. statut → `CLOSED` ;
  5. création automatique du mois suivant et copie `closingQuantity` → `openingQuantity`.
- Toutes les actions sensibles sont auditées dans `AuditLog` via l'interceptor `@Audit()`.

---

## Prérequis

- Node.js **≥ 20.10**
- pnpm **≥ 9**
- Docker (pour PostgreSQL)

---

## Démarrage rapide

```bash
# 1. Installer les dépendances
pnpm install

# 2. Démarrer PostgreSQL
pnpm db:up

# 3. Configurer les variables d'environnement
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env

# 4. Générer le client Prisma + appliquer la migration initiale
pnpm db:generate
pnpm db:migrate    # → crée la migration "init"

# 5. (Optionnel) Seed avec un admin + manager + catégories
pnpm db:seed

# 6. Démarrer backend + frontend en parallèle
pnpm dev
```

- Backend  : http://localhost:3001/api
- Swagger  : http://localhost:3001/docs
- Frontend : http://localhost:5173

### Comptes seedés

| Rôle    | Email                          | Mot de passe |
|---------|--------------------------------|--------------|
| ADMIN   | admin@inventorymdb.local       | Admin123!    |
| MANAGER | manager@inventorymdb.local     | Manager123!  |

---

## Commandes principales

| Commande              | Description                                  |
|-----------------------|----------------------------------------------|
| `pnpm dev`            | Démarre backend + frontend en parallèle      |
| `pnpm dev:backend`    | API NestJS uniquement                        |
| `pnpm dev:frontend`   | UI Vite uniquement                           |
| `pnpm build`          | Build production (apps)                      |
| `pnpm build:shared`   | Compile `@inventorymdb/shared`               |
| `pnpm db:up`          | Démarre PostgreSQL via Docker                |
| `pnpm db:down`        | Stoppe les containers                        |
| `pnpm db:migrate`     | Applique les migrations Prisma (dev)         |
| `pnpm db:generate`    | Génère le client Prisma                      |
| `pnpm db:seed`        | Charge les données initiales                 |
| `pnpm db:studio`      | Ouvre Prisma Studio                          |
| `pnpm typecheck`      | Vérification TypeScript de tous les packages |
| `pnpm lint`           | Lint de tous les packages                    |

### pgAdmin (optionnel)

```bash
docker compose --profile tools up -d pgadmin
# http://localhost:5050  —  admin@inventorymdb.local / admin
```

---

## Modèle de données

Voir `docs/diagrams/class-diagram.puml`. Entités principales :

`User` · `Category` · `Supplier` · `InventoryProduct` · `Purchase` · `PurchaseItem` · `InventoryPeriod` · `InventoryLine` · `InventoryReport` · `AuditLog`

Le schema Prisma source de vérité : [`apps/backend/prisma/schema.prisma`](apps/backend/prisma/schema.prisma).

---

## Diagrammes

Tous les diagrammes PlantUML sont dans `docs/diagrams/` :
- `use-case.puml` — acteurs et cas d'usage
- `class-diagram.puml` — modèle de données
- `sequence-close-period.puml` — séquence de clôture
- `activity-monthly-workflow.puml` — workflow mensuel

Rendu local : `code --install-extension jebbs.plantuml` (extension VS Code).

---

## Roadmap V1 → V1.1

- [ ] Branchement complet des pages (Products, Suppliers, Purchases, Inventory) sur les services API.
- [ ] Refresh tokens + rotation.
- [ ] Génération PDF complète via Puppeteer (template HTML).
- [ ] Import CSV des produits.
- [ ] Filtres avancés sur le dashboard (range de mois).
- [ ] V2 : séparation par succursale (`branchId`).
