# InventoryMDB — Audit read-only : Cycle de vie Produit + Comptabilité HT/TTC

> **Périmètre.** Audit read-only préalable à l'implémentation de deux
> évolutions. Aucune modification de code. Chaque assertion est ancrée
> à `fichier:ligne` réellement lu dans le dépôt à ce commit.

---

## 1. Résumé exécutif

### Demande 1 — Cycle de vie des produits (désactivation + suppression)

Le champ `InventoryProduct.isActive` **existe déjà** et le endpoint
`DELETE /api/products/:id` **fait un soft-delete** (`products.service.ts:280-287`).
Les principales fuites opérationnelles identifiées :

- **Achat neuf** : `assertProductsBelongToBranch` (`purchases.service.ts:98`)
  **n'exclut pas** les produits inactifs → un manager peut aujourd'hui créer
  un achat contenant un produit désactivé.
- **Import Excel** : preview + confirm (`products-import.service.ts:161,352`)
  **matchent les inactifs par nom** et les **réactivent silencieusement**
  via le path `update`.
- **Copie inter-branches** : la collision de nom (`products.service.ts:236`)
  **considère les inactifs** → statut `alreadyExisted` peut être renvoyé à
  cause d'un jumeau désactivé.
- **`GET /api/products` par défaut** retourne **actifs + inactifs** ; chaque
  sélecteur opérationnel doit passer `?isActive=true` explicitement, sinon
  l'inactif fuit dans les dropdowns.

Suppression physique : **jamais implémentée**. Aucun `prisma.inventoryProduct.delete(`
dans le backend. Faisable si et seulement si le service vérifie avant
`purchaseItem.count = 0 && inventoryLine.count = 0`. Les FKs `Restrict`
sur `PurchaseItem.productId` et `InventoryLine.productId` protègent
l'intégrité au niveau DB. **En pratique**, l'auto-création de lignes
par `ensureInventoryLinesForPeriod` (pour chaque produit actif à chaque
consultation d'une période) fait que quasi-tout produit ayant vécu
accumule des lignes → la suppression physique sera rarissime.

### Demande 2 — Rapport financier en HT

Le rapport financier consomme aujourd'hui **le TTC** :

```ts
// apps/backend/src/modules/financial-reports/financial-reports.service.ts:301
_sum: { totalAmount: true }
```

Le changement à faire est **littéralement une ligne** :
`totalAmount` → `amountBeforeTax` (+ un accès `_sum.amountBeforeTax` à la
ligne 350). Le champ HT est déjà :

- **Saisi par l'utilisateur** dans le formulaire de dépense
  (`AccountingExpenseFormDialog.tsx:432`, label "Montant HT *").
- **Persistant NOT NULL DEFAULT 0** depuis le tout premier commit
  (`20260523030533_add_accounting_expenses/migration.sql:18`).
- **Injecté correctement** par les mirrors (Purchase :
  `purchases.service.ts:361`, Repair : `repairs.service.ts:126`).

**Impact historique** : DRAFT recalculés à chaque lecture → **tous les brouillons
changent immédiatement**. LOCKED figés via `snapshot*` → **aucun rapport verrouillé
ne bouge** tant qu'il n'est pas déverrouillé et re-verrouillé. Pas de risque
de double-comptage : les mirrors Purchase sont explicitement
`includeInFinancialReports = false` (`purchases.service.ts:372`) ET
exclus par `sourceType != PURCHASE` (défense en profondeur, ligne 295).

⚠ **Ambiguïté nommage** : la demande du client mentionne des champs `tps` /
`tvq`. Le schéma Prisma utilise en réalité **`tpsAmount` / `tvqAmount`**
(`schema.prisma:436-437`). Ne pas se tromper dans les recherches futures.

---

## 2. Architecture actuelle observée (bref rappel)

Monorepo pnpm : `apps/backend` (NestJS 10), `apps/frontend` (React 18 +
Vite 5), `packages/shared` (Zod + types). PostgreSQL 16 via Prisma 5.20.
Multi-tenant par colonne `branchId` sur 8 modèles. Auth JWT, permissions
via `hasPermission(role, permission)`. Pour la couche complète voir
`INVENTORYMDB_ARCHITECTURE.txt`.

---

## 3. Audit du cycle de vie Produit

### 3.1 Modèle Prisma `InventoryProduct` (`schema.prisma:201-240`)

Champs pertinents :

- `isActive Boolean @default(true)` — le seul mécanisme actuel de désactivation.
- **Aucun `deletedAt`** — pas de soft-delete additionnel implémenté.
- Index `@@index([isActive])` → filtre `isActive` peu coûteux.

### 3.2 Endpoints cycle de vie (`products.controller.ts`)

| Verbe | Route | Fichier:ligne | Permission | Comportement | Type |
|---|---|---|---|---|---|
| POST | `/api/products` | `products.controller.ts:133-137` | `MANAGE_PRODUCTS` | Create (+ copy inter-branch atomique) | LIFECYCLE |
| PATCH | `/api/products/:id` | `products.controller.ts:140-144` | `MANAGE_PRODUCTS` | Update — **peut flipper `isActive`** via `UpdateProductDto` (PartialType) | LIFECYCLE |
| PATCH | `/api/products/:id/status` | `products.controller.ts:151-157` | `MANAGE_PRODUCTS` | `setStatus(id, dto.isActive)` — bascule dédiée | LIFECYCLE |
| DELETE | `/api/products/:id` | `products.controller.ts:160-165` | `MANAGE_PRODUCTS` | **SOFT DELETE** — appelle `service.remove` qui fait `update { isActive: false }` (`products.service.ts:280-287`) | LIFECYCLE |
| GET | `/api/products` | `products.controller.ts` | auth-only | `findAll` — voir §5 | MIXTE |
| GET | `/api/products/:id` | `products.controller.ts` | auth-only | `findOne` — pas de filtre `isActive` | HISTORIQUE |
| GET | `/api/products/template/excel` | `products.controller.ts` | auth-only | Template import | OPÉRATIONNEL |
| POST | `/api/products/import/preview` | `products.controller.ts` | `MANAGE_PRODUCTS` | Voir §7 | IMPORT |
| POST | `/api/products/import/confirm` | `products.controller.ts` | `MANAGE_PRODUCTS` | Voir §7 | IMPORT |

**Aucun endpoint ne réalise de suppression physique** — grep vérifié :
zéro appel `inventoryProduct.delete(` ou `deleteMany(` dans le backend.

---

## 4. Cartographie complète des usages de `InventoryProduct` (backend)

Table exhaustive de chaque lecture Prisma qui retourne des produits
(ou embarque un produit via `include`).

| # | Fichier:ligne | Requête | Filtre `isActive` actuel | Classification | Doit filtrer isActive en cible ? |
|---|---|---|---|---|---|
| 1 | `products.service.ts:92-125` | `findAll` (GET /products) | Optionnel via `?isActive=true|false` | **MIXTE** | Le contrôleur doit le passer explicitement selon l'appelant |
| 2 | `products.service.ts:134-141` | `findOne` (GET /:id) | Aucun | **HISTORIQUE** | Non — édition d'inactifs autorisée |
| 3 | `products.service.ts:236-243` | Collision nom pour cross-branch copy | Aucun | **COPY** | Décision métier (§20 Q1) |
| 4 | `products-import.service.ts:161` | `findMany` dedup preview | Aucun ; **pas de branch scope non plus** | **IMPORT** | Oui (opérationnel) + question métier « peut-on réactiver ? » |
| 5 | `products-import.service.ts:352-355` | `findMany` confirm upsert | Aucun | **IMPORT** | Oui — sinon réactivation silencieuse |
| 6 | `inventory-periods.service.ts:368-371` | `seedLinesForActiveProducts` | ✅ `isActive: true` | **OPÉRATIONNEL** | Déjà correct |
| 7 | `inventory-periods.service.ts:515-522` | `productMeta` inside `close()` | Aucun (borne par `productId IN`) | **HISTORIQUE** | Déjà correct |
| 8 | `inventory-lines.service.ts:203-206` | `ensureInventoryLinesForPeriod` | ✅ `isActive: true` | **OPÉRATIONNEL** | Déjà correct |
| 9 | `inventory-lines.service.ts:47-57` | `findByPeriod` include product+category | Aucun | **HISTORIQUE** | Déjà correct |
| 10 | `inventory-lines.service.ts:309-317` | `reconcileClosedReport` | Aucun | **HISTORIQUE** | Déjà correct |
| 11 | `purchases.service.ts:31` | `PURCHASE_INCLUDE` (select id, name, unit) | N/A | **HISTORIQUE** | Passthrough OK |
| 12 | `purchases.service.ts:98-101` | `assertProductsBelongToBranch` | ❌ Aucun | **OPÉRATIONNEL** | **⚠ Manquant — voir §14** |
| 13 | `purchases.service.ts:423-425` | `syncProductDefaultCostsFromPurchase` | N/A (write) | **LIFECYCLE side-effect** | N/A |
| 14 | `dashboard.service.ts:66-73` | `inventoryLine.findMany` include product.category | Aucun | **HISTORIQUE** | Déjà correct |
| 15 | `dashboard.service.ts:185, 237, 261, 683, 735` | Diverses aggregations par période | Aucun (bornées par periodId) | **HISTORIQUE** | Déjà correct |
| 16 | `dashboard.service.ts:644-647` | `getTopPurchasedProducts` | Aucun (bornée par groupBy PurchaseItem) | **HISTORIQUE** | Déjà correct |
| 17 | `exports.service.ts:722-726` | `inventoryCountTemplate` | ✅ `isActive: true` | **OPÉRATIONNEL** | Déjà correct |
| 18 | `exports.service.ts:110-114` | Export "Produits" (reuse `findAll`) | Suit filtre UI | **MIXTE** | Déjà correct |

**Modules qui NE touchent PAS directement `InventoryProduct`** :
`accounting`, `accounting-categories`, `financial-reports`, `audit-logs`,
`labor`, `repairs`. Ils ne créent aucune contrainte de lecture supplémentaire
sur les produits.

---

## 5. Classification catalogue opérationnel vs historique (règle métier)

### 5.1 Contextes OPÉRATIONNELS (doivent filtrer inactifs par défaut)

- Création d'un nouvel achat (`purchases.service.ts:98` `assertProducts…`)
  → **actuellement KO**.
- Preview / confirm d'un import Excel de produits (`products-import.service.ts`)
  → **actuellement KO** (matche + réactive).
- Bootstrap d'une nouvelle période d'inventaire
  (`inventory-periods.service.ts:368`) → **OK** déjà filtré.
- Ajout automatique de lignes à une période existante
  (`inventory-lines.service.ts:203`) → **OK** déjà filtré.
- Feuille Excel de comptage (`exports.service.ts:722`) → **OK** déjà filtré.
- Copie inter-branches d'un produit (nouveau produit dans la branche
  cible) → décision métier ; par défaut on ne devrait pas copier un
  inactif comme actif. Voir Q1 §20.
- Dropdowns / autocompletes dans l'UI d'achat, d'inventaire, de
  comptabilité (frontend §9).

### 5.2 Contextes HISTORIQUES (doivent conserver les inactifs)

- Détail d'un achat existant (`purchases.service.ts:31` `PURCHASE_INCLUDE`) :
  le nom du produit est **embarqué** dans le DTO → sûr même si le produit
  est désactivé plus tard.
- Lignes d'une période existante (`inventory-lines.service.ts:47`) :
  requête `include: { product: … }` sans filtre `isActive` → correct.
- Rapports d'inventaire (agrégations dashboard) : bornées par `periodId`,
  pas de filtre isActive → correct.
- Snapshot `InventoryReport` (par période) : contient déjà les valeurs
  agrégées, pas de dépendance à `isActive` en lecture → correct.
- Export d'une période passée (`exports.service.ts` inventoryLines) :
  suit le filtre historique.
- Audit logs : n'affiche que `entity + entityId`, pas de jointure directe
  sur `InventoryProduct` en lecture → sûr.

### 5.3 Contextes MIXTES

- `GET /api/products` : l'admin catalog affiche les deux (toggle
  All/Active/Inactive → **déjà supporté** via `?isActive=true|false`
  dans `ListProductsDto`).
- `productsService.list` frontend : appelé aujourd'hui par la page
  Products (mixte OK) et par `ManualPurchasesTab` (fuite, voir §9).

---

## 6. Audit des règles de désactivation

### 6.1 Ce qui fonctionne

- Bascule `PATCH /api/products/:id/status` → soft-disable, préserve
  toutes les FKs (`Restrict` fait son travail : impossible de supprimer
  physiquement tant qu'il y a des références, mais on ne supprime jamais
  physiquement).
- Frontend : `ProductStatusDialog.tsx:22-32` appelle `setStatus`, invalide
  `['products']` + `['dashboard']`.
- Le seed script cross-branch est cohérent avec le passage à
  `isActive=false` (aucun re-hash/re-active).
- Feuille de comptage Excel exclut déjà les inactifs.
- Bootstrap période / ensure lignes excluent déjà les inactifs.

### 6.2 Ce qui est cassé (à traiter avant livraison)

| Problème | Preuve | Impact |
|---|---|---|
| `assertProductsBelongToBranch` accepte les inactifs pour un NOUVEL achat | `purchases.service.ts:98-101` | ÉLEVÉ — un manager peut créer un achat sur un produit désactivé |
| Import Excel : le path `update` (`products-import.service.ts:391`) réactive un produit inactif si son nom matche | `products-import.service.ts:352-355, 391, 442 (parseBool default true)` | ÉLEVÉ — réactivation silencieuse à chaque import |
| Frontend `ManualPurchasesTab` liste TOUS les produits (inactifs inclus dans le payload) puis filtre côté client dans `PurchaseFormDialog` | `ManualPurchasesTab.tsx:75`, `PurchaseFormDialog.tsx:112-113` | MOYEN — fuite dans DevTools, waste bandwidth, dépend du client-side filtering |
| `InventoryLinesTable` n'affiche AUCUN marqueur « (inactif) » alors que `product.isActive` est disponible dans le DTO | `InventoryLinesTable.tsx:170`, `packages/shared/src/types/index.ts:158` | MOYEN — ambiguïté visuelle sur les périodes contenant des produits ensuite désactivés |
| `PurchaseDetailDialog` ne peut pas marquer « (inactif) » car `PurchaseItemDto.product` n'expose pas `isActive` | `packages/shared/src/types/index.ts:187-191` | FAIBLE — requiert petit changement de DTO backend |
| Cross-branch copy : collision `alreadyExisted` triggée par un inactif dans l'autre branche | `products.service.ts:236-243` | FAIBLE — question métier |

---

## 7. Audit de la suppression définitive

### 7.1 État actuel

- `productsService.remove()` **fait un soft-delete** (met `isActive=false`).
  Aucun path hard-delete n'est exposé.
- Aucun bouton "Supprimer" dans l'UI (`ProductTable.tsx:174-204` a
  seulement Modifier + Toggle status).

### 7.2 Faisabilité DB d'une vraie suppression physique

FKs entrantes qui **bloquent** un `DELETE FROM inventory_products` :

- `PurchaseItem.productId` — `onDelete: Restrict` (`schema.prisma:288`)
- `InventoryLine.productId` — `onDelete: Restrict` (`schema.prisma:334`)

FKs sortantes (n'affectent pas la suppression du produit lui-même) :

- `InventoryProduct.branchId → Branch` : `Restrict`
- `InventoryProduct.categoryId → Category` : `SetNull`
- `InventoryProduct.supplierId → Supplier` : `SetNull`

**Aucun `Cascade` entrant → aucune perte silencieuse d'historique
possible en cas de delete accidentel** (le DB dira P2003 avant). C'est
un excellent garde-fou natif.

### 7.3 Règle cible réaliste

1. Un produit **actif** ne peut pas être supprimé physiquement (client OK).
2. Un produit **inactif** peut être supprimé physiquement **si et
   seulement si** :
   - `purchaseItem.count({ where: { productId } }) === 0`
   - `inventoryLine.count({ where: { productId } }) === 0`
3. Sinon → soft-delete permanent (déjà l'état actuel de fait).

### 7.4 Cas d'usage réaliste

Grâce à `ensureInventoryLinesForPeriod` qui crée une `InventoryLine`
pour chaque produit actif à chaque consultation d'une période, **quasi
tous les produits qui ont vécu au moins une période accumulent des
lignes**. Suppression physique effective : **produits créés par erreur
qui n'ont jamais été vus par une période ET jamais achetés**. Rare
mais utile (correction typo, produit test).

### 7.5 Endpoints à créer

- **Nouveau** : `DELETE /api/products/:id/hard` ou `DELETE /api/products/:id?force=true`
  - Vérifie `isActive === false` → sinon 409 « désactivez d'abord »
  - Vérifie `references === 0` → sinon 409 « historique existant »
  - Exécute `prisma.inventoryProduct.delete`
  - `@Audit({ action: 'DELETE', entity: 'InventoryProduct' })`
  - Permission `MANAGE_PRODUCTS` (idem que soft-delete)
- **Nouveau** : `GET /api/products/:id/references` (facultatif)
  - Retourne `{ purchaseItemCount, inventoryLineCount, canHardDelete }`
  - Permet à l'UI de désactiver le bouton avant même l'appel

### 7.6 UI à ajouter

- Bouton `Trash2` dans `ProductTable.tsx:174-204`, seulement quand
  `isActive === false` ET `canHardDelete === true`.
- Dialog de confirmation typée (« Tapez le nom du produit »).
- Toast d'erreur si le back répond 409.
- Message métier recommandé : « Ce produit apparaît dans X achats et Y
  périodes d'inventaire ; il ne peut pas être supprimé pour préserver
  l'historique. Vous pouvez le laisser désactivé. »

---

## 8. Relations Prisma et risques d'intégrité

| Relation | Sens | onDelete | Risque | Note |
|---|---|---|---|---|
| `PurchaseItem.productId → InventoryProduct.id` | vers produit | `Restrict` | Aucun (bloque delete) | Bouclier natif |
| `InventoryLine.productId → InventoryProduct.id` | vers produit | `Restrict` | Aucun (bloque delete) | Bouclier natif |
| `InventoryProduct.branchId → Branch.id` | vers branche | `Restrict` | Aucun (bloque delete branche si produits existent) | Correct |
| `InventoryProduct.categoryId → Category.id` | vers catégorie | `SetNull` | Orphelin catégorie possible | Intentionnel — un produit peut perdre sa catégorie |
| `InventoryProduct.supplierId → Supplier.id` | vers fournisseur | `SetNull` | Orphelin fournisseur possible | Intentionnel |

**Aucune contrainte DB à modifier pour la Demande 1.** Les FKs actuelles
sont exactement ce qu'il faut.

---

## 9. Audit frontend des listes et sélecteurs

### 9.1 Sites d'appel `productsService`

| # | Fichier:ligne | Hook | Params passés | Usage UI |
|---|---|---|---|---|
| 1 | `pages/products/ProductsPage.tsx:104` | `useQuery(['products', queryParams])` | filtres dont `isActive?` selon toggle UI | Catalogue paginé |
| 2 | `components/purchases/ManualPurchasesTab.tsx:75` | `useQuery(['products','for-form',branchId])` | **`isActive` NON passé** — pageSize=200, tri par nom | Alimente `<Select>` du formulaire d'achat |
| 3 | `components/products/ProductFormDialog.tsx:216-217` | `useMutation` | update / create | Formulaire produit |
| 4 | `components/products/ProductStatusDialog.tsx:26` | `useMutation` | `setStatus(id, !isActive)` | Toggle admin |
| 5 | `components/products/import/ProductImportDialog.tsx:51,63,87` | `useMutation` | template / preview / confirm | Import Excel |

### 9.2 Classification par surface

| Surface | Fichier | Endpoint | Filtre actuel | Doit afficher inactifs ? | Priorité |
|---|---|---|---|---|---|
| Catalogue produits | `ProductsPage.tsx` | GET /products | Toggle UI | **BOTH via toggle — OK** | Basse |
| Édition produit | `ProductFormDialog.tsx` | PATCH | N/A | **Oui — OK** | Basse |
| Dropdown ligne d'achat (nouveau) | `PurchaseItemsEditor.tsx:332` via `PurchaseFormDialog.tsx:112` | GET /products | Filtre client-side `.filter(p.isActive)` + réinjection du produit courant en édition | **Actifs uniquement + garder le produit sélectionné en édition** | **HAUTE** |
| Détail achat existant | `PurchaseDetailDialog.tsx:175` | Nested `it.product` | Nom embarqué, `isActive` absent | **HISTORIQUE — OK côté données, MOYEN côté badge** | Moyenne (DTO) |
| Table lignes d'inventaire | `InventoryLinesTable.tsx:170` | GET /inventory-periods/:id/lines | Aucun — DTO contient `product.isActive` | **HISTORIQUE — OK côté données, MOYEN côté badge « (inactif) »** | Moyenne |
| Bootstrap inventaire | `BootstrapInventoryDialog.tsx` | POST /inventory-periods/bootstrap | Backend seule autorité | **Actifs uniquement (déjà)** | Basse |
| Import wizard | `ProductImportDialog.tsx` + `ProductImportPreviewTable.tsx` | POST /products/import/* | Aucun warning sur match d'inactif | **Doit warner + ne pas réactiver silencieusement** | Moyenne |

### 9.3 Cache TanStack Query

Query keys actuelles :

- `['products', queryParams]`
- `['products', 'for-form', branchId]`

Invalidations (préfixe `['products']` = invalide les 2) :

- `ProductFormDialog.tsx:248`
- `ProductStatusDialog.tsx:29`
- `ProductImportDialog.tsx:93`
- `PurchaseFormDialog.tsx:160` (invalide car le backend réécrit `defaultCost`)
- `CategoryFormDialog.tsx:83`, `CategoryStatusDialog.tsx:34`
- `hooks/useBranchesAdmin.ts:19`

Ajouter un paramètre `?includeInactive=false` créerait une clé cache
séparée, ce qui est le comportement souhaité (dédupe naturel).

### 9.4 Bouton Supprimer — inexistant

`ProductTable.tsx:174-204` contient uniquement Modifier + Toggle status.
Point d'ajout naturel = à droite du bouton `PowerOff`, en rouge, actif
uniquement si `!isActive && canHardDelete`.

---

## 10. Audit du flux Comptabilité → Rapport financier

### 10.1 Flux end-to-end (contexte des dépenses **manuelles**, pas des mirrors)

```
1. AccountingExpenseFormDialog.tsx
   User entre : HT, TPS, TVQ.  TTC = HT + TPS + TVQ (affichage read-only).
              ↓
2. POST /api/accounting/expenses
   payload = { amountBeforeTax, tpsAmount, tvqAmount, ... }
              ↓
3. accounting.service.ts:326-329 (create)
   totalAmount = round2(sumTaxes(HT, TPS, TVQ))
              ↓
4. INSERT INTO accounting_expenses
   (amountBeforeTax, tpsAmount, tvqAmount, totalAmount, includeInFinancialReports=?, ...)
              ↓
5. financial-reports.service.ts:288-302 (computeLive, appelé pour DRAFT)
   accountingExpense.groupBy({
     where: { branchId, expenseDate window, deletedAt: null,
              includeInFinancialReports: true,
              sourceType: { not: PURCHASE },
              accountingCategoryId: { not: null } },
     by: ['accountingCategoryId'],
     _sum: { totalAmount: true }        ← BUG SELON LE CLIENT (devrait être amountBeforeTax)
   })
              ↓
6. FinancialReportsPage.tsx:513 lit report.expensesByCategory
   Frontend n'a pas accès au HT séparé pour ces catégories.
              ↓
7. exports.service.ts:1082-1106 (Excel + PDF)
   Consomme expensesByCategory tel quel — hérite automatiquement.
```

### 10.2 Flux mirror **Purchase → AccountingExpense** (déjà correct côté données)

`purchases.service.ts:314-375` (`syncAccountingExpensesForPurchase`)
appelé dans les transactions create/update/delete de Purchase :

- `amountBeforeTax = p.subtotalHT` ✅ (`purchases.service.ts:361`)
- `tpsAmount = p.tpsAmount` ✅
- `tvqAmount = p.tvqAmount` ✅
- `totalAmount = p.totalAmount` ✅
- `sourceType = PURCHASE` (ligne 366)
- **`includeInFinancialReports = false`** ✅ (ligne 372) — jamais dans le rapport
- Delete cascade via FK `AccountingExpense.purchaseId` unique + `onDelete: Cascade`

### 10.3 Flux mirror **RepairEntry → AccountingExpense** (LIVE aujourd'hui)

`repairs.service.ts:93-156` (`syncAccountingExpenseForRepair`), appelé
lignes 226 et 258 :

- `amountBeforeTax = r.amountBeforeTax` ✅
- `tpsAmount = r.tpsAmount` ✅
- `tvqAmount = r.tvqAmount` ✅
- `totalAmount = r.totalAmount` ✅
- `sourceType = REPAIR`
- **`includeInFinancialReports = true` sur CREATE** (ligne 136) — dans le rapport
- Sur UPDATE, `includeInFinancialReports` **n'est pas touché** (commentaire ligne 151-153) — respecte l'override manuel utilisateur

### 10.4 Flux mirror **LaborEntry → AccountingExpense** (DEAD CODE)

- Migration `20260603000000_drop_labor_accounting_sync/migration.sql:16` :
  `DELETE FROM accounting_expenses WHERE sourceType = 'LABOR';`
- `labor.service.ts:17-33` — commentaire d'en-tête explique que la
  synchronisation a été retirée.
- Le rapport lit `LaborEntry` directement (`_sum: totalAmount`)
  ligne 305-311 de `financial-reports.service.ts`.
- Aucun impact sur la Demande 2 (le path est mort).

---

## 11. Cartographie des champs HT / taxes / TTC

### 11.1 `AccountingExpense` (`schema.prisma:412-472`)

| Champ | Type | NOT NULL | Rôle |
|---|---|---|---|
| `amountBeforeTax` | Decimal(14,2) | ✅ DEFAULT 0 | **HT** — cible de la Demande 2 |
| `tpsAmount` | Decimal(14,2) | ✅ DEFAULT 0 | TPS (⚠ **NOT** `tps` comme dans la demande client) |
| `tvqAmount` | Decimal(14,2) | ✅ DEFAULT 0 | TVQ (⚠ **NOT** `tvq`) |
| `totalAmount` | Decimal(14,2) | ✅ DEFAULT 0 | **TTC** — utilisé aujourd'hui par le rapport |
| `includeInFinancialReports` | Boolean | ✅ DEFAULT false | Opt-in ligne par ligne dans le rapport |
| `sourceType` | AccountingSourceType | ✅ DEFAULT MANUAL | MANUAL / PURCHASE / LABOR (dead) / REPAIR |
| `deletedAt` | DateTime? | | Soft-delete des dépenses |

### 11.2 `Purchase` (`schema.prisma:255-277`)

| Champ | Type | Rôle |
|---|---|---|
| `subtotalHT` | Decimal(14,2) | HT — source du mirror `amountBeforeTax` |
| `tpsAmount` | Decimal(14,2) | TPS |
| `tvqAmount` | Decimal(14,2) | TVQ |
| `totalAmount` | Decimal(14,2) | TTC |

### 11.3 `PurchaseItem` (`schema.prisma:279-293`)

**Aucune taxe sur la ligne d'achat.** Les taxes ne vivent que sur
l'en-tête `Purchase`. Les lignes ont : `quantity`, `unitPrice`,
`totalPrice` (= qty × unitPrice, pré-taxes).

### 11.4 `RepairEntry` (`schema.prisma:597-620`)

Colonnes symétriques à AccountingExpense/Purchase :
`amountBeforeTax`, `tpsAmount`, `tvqAmount`, `totalAmount`.

### 11.5 `LaborEntry` (`schema.prisma:563-582`)

**Pas de taxes.** Coût = `hours × hourlyRate = totalAmount`.

### 11.6 `FinancialReport` (`schema.prisma:509-554`)

- Colonnes DRAFT-friendly : `sales, discounts, employeeMeals, tips,
  otherRevenue, laborCost` (toutes Decimal(14,2)).
- Colonnes snapshot (remplies au `lock()`) :
  `snapshotFoodCost`, `snapshotPaperCost`, `snapshotCleaningCost`,
  `snapshotExpensesByCategory` (Json — mapping `nomCategorie → montant`),
  `snapshotTotalExpenses`, `snapshotGrossRevenue`, `snapshotNetRevenue`,
  `snapshotNetProfit`, `snapshotFoodCostPct`, `snapshotNetMarginPct`.

### 11.7 Invariant HT + TPS + TVQ = TTC

- **Enforced côté service** dans 3 emplacements :
  - `accounting.service.ts:326-329, 448-451` (create / update)
  - `purchases.service.ts:290-298` (compute totals)
  - `repairs.service.ts:126-129, 145-148`
- Via `sumTaxes()` de `packages/shared/src/lib/taxes.ts:63-68`.
- **Pas d'enforcement DB** (aucun CHECK constraint) et **pas de
  validation croisée DTO** (les DTOs ne demandent même pas
  `totalAmount`, seulement HT/TPS/TVQ). → Invariant tenu par la seule
  discipline du service.

---

## 12. Calcul actuellement utilisé dans le rapport financier

### 12.1 La ligne critique

```ts
// apps/backend/src/modules/financial-reports/financial-reports.service.ts:288-302
const rows = await this.prisma.accountingExpense.groupBy({
  by: ['accountingCategoryId'],
  where: {
    branchId: report.branchId,
    expenseDate: { gte: start, lt: end },
    deletedAt: null,
    includeInFinancialReports: true,
    sourceType: { not: AccountingSourceType.PURCHASE },
    accountingCategoryId: { not: null },
  },
  _sum: { totalAmount: true },    // ← LIGNE 301 : TTC AUJOURD'HUI
});
```

Puis ligne 350 :

```ts
const sum = row._sum.totalAmount ?? new Prisma.Decimal(0);
```

### 12.2 Composition finale de `totalExpenses`

`financial-reports.service.ts:374` :

```
totalExpenses = realCost                        (déjà HT — vient de InventoryReport)
              + Σ categoryTotals                (⚠ TTC aujourd'hui)
              + laborCost                       (LaborEntry direct)
```

`realCost` est déjà en HT car il est calculé à partir de
`PurchaseItem.totalPrice` (qty × unitPrice), qui est **pré-taxes** par
construction (pas de tax sur PurchaseItem — §11.3). Donc la nourriture,
le papier et le nettoyage issus des achats-cuisine sont déjà en HT.

**Le seul stream aujourd'hui en TTC est le groupBy des AccountingExpense
via l'agrégation ci-dessus.**

### 12.3 Comportement DRAFT vs LOCKED

- `computeLive()` (`financial-reports.service.ts:264-312`) est appelé par
  `serializeLive()` (`417-459`), utilisé pour tous les rapports DRAFT.
  → **Recalcul à chaque lecture.**
- `serializeLocked()` (`461-537`) lit exclusivement les colonnes
  `snapshot*`, ne re-requête jamais `accountingExpense`.
  → **Rapports LOCKED complètement figés.**
- `lock()` (`157-187`) : appelle `computeLive()` puis écrit tous les
  snapshots + `status=LOCKED` + `lockedAt`/`lockedById`.
- `unlock()` (`193-206`) : flip status DRAFT, `lockedAt=null`,
  **conserve les snapshots** (commentaire ligne 190).

---

## 13. Impact sur les données et rapports historiques

### 13.1 Demande 1 (produits)

| Action | Impact données historiques |
|---|---|
| Ajouter `?isActive=true` sur endpoints opérationnels | Aucun — le default reste MIXTE, ne casse aucun consumer historique |
| Filtrer `assertProductsBelongToBranch` sur `isActive=true` | Aucun — bloque uniquement les NOUVEAUX achats sur inactifs. Les anciens achats gardent leurs productId (FK Restrict) |
| Fixer l'import pour warner sur inactif | Aucun — modifie comportement futur |
| Ajouter DELETE physique conditionnel | Aucun — refuse par 409 dès qu'il existe une trace |
| Ajouter badge « (inactif) » dans InventoryLinesTable | Aucun — visuel uniquement |
| Étendre `PurchaseItemDto.product` avec `isActive` | Aucun — extend le wire type, ne retire rien |

### 13.2 Demande 2 (HT vs TTC)

| Rapport | Statut | Impact au flip TTC → HT |
|---|---|---|
| DRAFT (mois courant) | Live-computed | **Change immédiatement** — reflète HT dès le prochain refresh |
| DRAFT (mois passés jamais lockés) | Live-computed | **Change immédiatement** — même comportement |
| LOCKED | Snapshot figé | **Aucun changement** tant qu'on ne re-lock pas |
| LOCKED puis unlock | Snapshot conservé mais serializeLive appelé | **Change immédiatement** au moment du unlock (car serializeLive) |
| Re-locked après flip | Snapshot mis à jour | **Fige les nouveaux HT** |

**Backfill nécessaire ?** Non pour les DRAFT (recalcul auto). Pour
harmoniser les LOCKED historiques avec la nouvelle règle, il faudrait
un batch admin `unlock() → lock()` pour chaque report LOCKED — décision
métier (Q5 §20).

**Risque données**: rows où `amountBeforeTax = 0` mais `totalAmount > 0`
avec `includeInFinancialReports=true`. Requête pré-flight recommandée :

```sql
SELECT COUNT(*) AS suspicious_rows
FROM accounting_expenses
WHERE "includeInFinancialReports" = true
  AND "amountBeforeTax" = 0
  AND "totalAmount"     > 0
  AND "deletedAt" IS NULL;
```

Si `> 0` → discussion avec le client sur ces lignes avant flip.

---

## 14. Risques de régression

### 14.1 Demande 1

| Risque | Sévérité | Mitigation |
|---|---|---|
| Casser l'affichage d'un ancien achat contenant un produit désactivé | ÉLEVÉE | Ne PAS ajouter `isActive:true` sur `PURCHASE_INCLUDE` ; conserver `findOne` sans filtre |
| Casser l'affichage d'une période contenant des produits ensuite désactivés | ÉLEVÉE | Ne PAS filtrer `ensureInventoryLinesForPeriod` **au moment de la lecture** ; le filtre est déjà correct à la seed |
| Casser la copie inter-branches avec un jumeau inactif | MOYENNE | Décision métier — soit ignorer les inactifs (créer le mirror), soit garder le comportement `alreadyExisted` |
| Empêcher l'admin d'éditer un inactif | MOYENNE | `findOne` sans filtre + endpoint update autorisé même sur inactif (déjà OK) |
| Réactivation silencieuse via import | MOYENNE→BASSE (après fix) | Import doit soit refuser, soit demander confirmation UX |
| Perte de trace suite à un hard-delete | ÉLEVÉE si mal codé | Gate stricte (`references === 0`) + `@Audit DELETE` obligatoire |

### 14.2 Demande 2

| Risque | Sévérité | Mitigation |
|---|---|---|
| Rows avec HT=0 & TTC>0 disparaissent du rapport | MOYENNE | Requête pré-flight §13.2 + option de fallback `COALESCE(amountBeforeTax, totalAmount)` (à discuter avec le client) |
| Le rapport passé qui montrait X TTC va basculer à Y HT au prochain deploy pour tout DRAFT | ÉLEVÉE (visibilité utilisateur) | Communication client + option 1 : re-lock proactif des DRAFT du mois en cours ; option 2 : feature flag temporaire |
| Confusion utilisateur entre ce que l'UI Comptabilité montre (HT/TPS/TVQ/TTC) et ce que le rapport affiche | MOYENNE | Ajouter dans `FinancialReportsPage.tsx` un tooltip explicite « Montants pris en compte : HT » |
| Repair mirror en TTC → HT changera aussi | BASSE | Attendu — le rapport doit être HT-only pour toutes les dépenses opérationnelles |
| Ligne d'export PDF/Excel n'annonce pas HT | MOYENNE | Modifier le template pour titrer « Montant (HT) » |
| L'agrégation par catégorie sur `snapshotExpensesByCategory` (JSON) des reports LOCKED reste TTC | ATTENDU | Documentation client — discontinuité au flip |

---

## 15. Compatibilité ascendante

### 15.1 Demande 1

- **Aucune migration Prisma requise.** Toutes les colonnes existent.
- **Contrat API** : ajout de paramètres query optionnels rétrocompatibles
  (`?includeInactive`), ajout d'un endpoint DELETE `?force=true` ou
  `/hard`, ajout d'un champ `isActive` sur `PurchaseItemDto.product`
  (additif, sans breaking).
- **Frontend** : ajout de props optionnelles ; le rendu par défaut ne
  change pas pour les surfaces historiques.

### 15.2 Demande 2

- **Aucune migration Prisma requise.** `amountBeforeTax` NOT NULL depuis
  le premier commit.
- **Aucun changement de wire type** (`FinancialReportDto.expensesByCategory`
  reste `Record<string, number>` — juste la valeur numérique change).
- **Aucun changement UI backend-driven** (frontend consomme la même clé).
- **Rupture logique** : la même endpoint retourne des valeurs
  différentes après deploy. C'est **volontaire** mais mérite un
  communiqué et une release note explicite.

---

## 16. Tests existants et tests manquants

### 16.1 Tests existants — **AUCUN**

Vérifié :

- `pnpm --filter @inventorymdb/backend test` → **« No tests found »**.
- `pnpm --filter @inventorymdb/frontend test` — pas de script `test`.
- `packages/shared` — pas de script `test` ni de test files.
- Aucun fichier `*.spec.ts` ou `*.test.ts` dans `apps/backend/src` ou
  `apps/frontend/src`.

Le repo est **entièrement démuni de tests automatisés** aujourd'hui. C'est
un chantier structurel à part entière — dépasse le périmètre de ces deux
demandes mais doit être mentionné.

### 16.2 Matrice de tests recommandée (à créer)

#### Produits

| # | Cas | Type | Niveau |
|---|---|---|---|
| P1 | Créer un produit → `isActive=true` par défaut | E2E backend | unitaire |
| P2 | `PATCH /:id/status` bascule true→false et false→true | E2E backend | unitaire |
| P3 | `DELETE /:id` (soft) — le produit reste en base avec `isActive=false` | E2E backend | unitaire |
| P4 | `DELETE /:id/hard` refuse un produit actif → 409 | E2E backend | unitaire |
| P5 | `DELETE /:id/hard` refuse un produit inactif avec un `PurchaseItem` → 409 | E2E backend | unitaire |
| P6 | `DELETE /:id/hard` refuse un produit inactif avec une `InventoryLine` → 409 | E2E backend | unitaire |
| P7 | `DELETE /:id/hard` réussit sur inactif sans référence | E2E backend | unitaire |
| P8 | `POST /purchases` avec un `productId` inactif → 400 | E2E backend | intégration |
| P9 | `POST /purchases` sur `productId` inactif référencé dans un ancien achat via update ne casse pas | E2E backend | régression |
| P10 | `GET /purchases/:oldId` retourne le nom du produit désactivé | E2E backend | régression |
| P11 | `GET /inventory-periods/:oldId/lines` retourne les lignes sur inactifs | E2E backend | régression |
| P12 | `POST /products/import/preview` warne sur match d'inactif | E2E backend | intégration |
| P13 | `POST /products/import/confirm` ne réactive pas silencieusement (au moins sans flag explicite) | E2E backend | intégration |
| P14 | `inventoryCountTemplate` d'une période OUVERTE exclut inactifs | E2E backend | intégration |
| P15 | `bootstrap` d'une nouvelle période exclut inactifs | E2E backend | intégration |
| P16 | Frontend : dropdown d'achat masque un produit désactivé mid-formulaire | Cypress | E2E |
| P17 | Frontend : badge « inactif » présent dans InventoryLinesTable pour ancien produit | Cypress | E2E |
| P18 | Frontend : bouton Delete désactivé si `isActive=true` | Cypress | E2E |
| P19 | Cross-branch copy : décision métier prise sur inactifs | E2E backend | dépend décision |

#### Comptabilité / rapports

| # | Cas | Type |
|---|---|---|
| C1 | `sumTaxes(HT, TPS, TVQ)` = HT+TPS+TVQ sur 3 exemples | unitaire shared |
| C2 | `POST /accounting/expenses` calcule bien `totalAmount = HT+TPS+TVQ` | E2E backend |
| C3 | `POST /accounting/expenses` avec `includeInFinancialReports=true` remonte au rapport | intégration |
| C4 | Rapport DRAFT : somme des dépenses = **Σ amountBeforeTax** des lignes opt-in (nouvelle règle) | intégration |
| C5 | Rapport LOCKED : snapshot inchangé après flip HT | intégration |
| C6 | Rapport LOCKED unlock → serializeLive utilise HT | intégration |
| C7 | Purchase mirror : `amountBeforeTax = subtotalHT` + `includeInFinancialReports=false` | E2E backend |
| C8 | Purchase mirror : NE compte PAS dans le rapport (double-check sourceType filter) | intégration |
| C9 | Repair mirror : `amountBeforeTax = r.amountBeforeTax` + inclus par défaut | E2E backend |
| C10 | Export PDF financial report montre bien HT après flip | intégration |
| C11 | Rows aberrantes (HT=0, TTC>0) : le montant final est 0 (attendu) | régression + décision |
| C12 | Frontend AccountingExpenseFormDialog : affichage HT/TPS/TVQ/TTC inchangé | Cypress |
| C13 | Frontend FinancialReportsPage : tooltip « Montants HT » présent | Cypress |

---

## 17. Recommandation d'architecture

### 17.1 Demande 1

**Approche recommandée** : cocktail 2-en-1.

- **Soft-delete comme état par défaut permanent** (état actuel, correct).
- **Hard-delete conditionnel** exposé via un endpoint distinct
  `DELETE /api/products/:id/hard` OU `?force=true`, avec double
  vérification (isActive=false ET aucune référence). Le contrat 409 est
  la protection utilisateur, les FKs `Restrict` sont la protection DB.
- **Filtrage OPÉRATIONNEL centralisé** : ajouter une méthode dédiée
  `productsService.findActiveForOperations(branchId)` que tous les
  contextes opérationnels utilisent (achats, imports, autocompletes).
  Ne PAS globalement ajouter `isActive: true` à `findAll` — casserait
  l'admin catalog.
- **DTO enrichi** : ajouter `product.isActive` sur `PurchaseItemDto` pour
  permettre le badge côté détail achat.
- **UI** : bouton Delete rouge + confirmation typée dans `ProductTable`,
  badge « inactif » visible dans `InventoryLinesTable` et
  `PurchaseDetailDialog`, filtre client-side du dropdown d'achat renforcé
  par filtre server-side.

### 17.2 Demande 2

**Approche recommandée** : flip minimal + backfill optionnel.

- **Changement code** : `_sum: { totalAmount: true }` →
  `_sum: { amountBeforeTax: true }` à la ligne 301, et ajuster la lecture
  ligne 350 (`_sum.amountBeforeTax`).
- **Communication produit** : release note explicite ; les rapports du
  mois en cours vont refléter HT dès le prochain rafraîchissement.
- **UI** : ajouter un libellé explicite « (HT) » sur la colonne montant
  du rapport financier + dans les exports PDF/Excel (`exports.service.ts`
  ligne 1082-1106 : titre de colonne).
- **Backfill optionnel** : proposer un endpoint admin
  `POST /api/financial-reports/:id/relock` pour re-figer un LOCKED sans
  passer par unlock/lock manuel. À discuter avec le client selon la
  politique historique souhaitée.
- **Pré-flight query** (§13.2) à exécuter en prod AVANT le deploy pour
  compter les lignes suspectes.
- **Renommage** (facultatif, hors périmètre immédiat) : le vocabulaire
  Prisma `tpsAmount`/`tvqAmount` mais code métier appelle parfois `tps`/`tvq`.
  Aligner dans les futures DTOs si un renommage est envisagé.

---

## 18. Plan d'implémentation futur découpé en phases

### Demande 1 — 5 phases

**Phase 1.1 — Backend guardrails opérationnels** (0 rupture)
- `purchases.service.ts:98` `assertProductsBelongToBranch` : ajouter `isActive: true` au where
- `products-import.service.ts:161, 352` : ne matcher que les actifs, warner si un nom collide avec un inactif
- Test P8, P12, P13

**Phase 1.2 — DTO enrichi** (additif, non-breaking)
- `packages/shared/src/types/index.ts:187-191` : ajouter `isActive: boolean` à `PurchaseItemDto.product`
- `purchases.service.ts:31` `PURCHASE_INCLUDE` : inclure `isActive` dans le select
- Test régression P10

**Phase 1.3 — Endpoint hard-delete conditionnel** (nouveau, non-breaking)
- `products.controller.ts` : ajouter `DELETE /:id/hard` ou paramètre `?force=true`
- `products.service.ts` : ajouter `hardRemove(id)` avec pré-check counts
- Nouveau `GET /:id/references` retournant `{ purchaseItemCount, inventoryLineCount, canHardDelete }`
- Tests P4-P7

**Phase 1.4 — Frontend opérationnel** (UX)
- `ManualPurchasesTab.tsx:75` : passer `isActive: 'true'` dans la query
- `PurchaseFormDialog.tsx:112-113` : garder la réinjection du produit courant en édition
- `InventoryLinesTable.tsx:170` : badge « (inactif) » quand `product.isActive === false`
- `PurchaseDetailDialog.tsx:175` : idem, après DTO enrichi
- `ProductImportPreviewTable.tsx` : afficher warnings pour matches inactifs
- Test P16, P17

**Phase 1.5 — Frontend hard-delete UI** (nouveau)
- `ProductTable.tsx` : bouton `Trash2` rouge, actif si `!isActive && canHardDelete`
- Nouveau `ProductDeleteDialog.tsx` : confirmation typée
- `productsService.remove(id, { force: true })` + `productsService.getReferences(id)`
- Test P18

### Demande 2 — 4 phases

**Phase 2.1 — Pré-flight query en prod** (mesure zéro-code)
- Exécuter la query §13.2 sur DB prod
- Consolider les résultats avec le client
- **GATE** : si > 0 lignes, arbitrer avant de coder

**Phase 2.2 — Backend flip formule** (1 ligne + libellé)
- `financial-reports.service.ts:301` : `totalAmount` → `amountBeforeTax`
- `financial-reports.service.ts:350` : lire `_sum.amountBeforeTax`
- Tests C4, C5, C6, C7, C8, C9, C11

**Phase 2.3 — Libellés UI + exports** (cosmétique)
- `FinancialReportsPage.tsx` : ajouter tooltip / libellé « (HT) » sur la colonne
- `exports.service.ts:1082-1106` : titre de colonne PDF/Excel « Montant (HT) »
- Test C10, C13

**Phase 2.4 — (Optionnel) Relock admin batch** (nouveau endpoint)
- `POST /api/financial-reports/:id/relock` (`OWNER`/`ADMIN`)
- Ou script admin standalone (`scripts/relock-historical.ts`)
- Uniquement si le client demande la migration rétroactive des LOCKED

---

## 19. Fichiers potentiellement concernés

### Demande 1

**Backend**
- `apps/backend/src/modules/products/products.service.ts`
- `apps/backend/src/modules/products/products.controller.ts`
- `apps/backend/src/modules/products/products-import.service.ts`
- `apps/backend/src/modules/products/dto/list-products.dto.ts` (nouveau param éventuel)
- `apps/backend/src/modules/purchases/purchases.service.ts` (ligne 98)
- `apps/backend/src/modules/purchases/purchases.controller.ts` (aucun changement direct, hérité)

**Shared**
- `packages/shared/src/types/index.ts` (`PurchaseItemDto`, potentiellement `ProductDto`)

**Frontend**
- `apps/frontend/src/services/products.service.ts` (ajout `remove(id, {force})` + `getReferences(id)`)
- `apps/frontend/src/components/products/ProductTable.tsx` (bouton delete)
- `apps/frontend/src/components/products/ProductFormDialog.tsx` (rien si signature stable)
- `apps/frontend/src/components/products/ProductDeleteDialog.tsx` (**nouveau**)
- `apps/frontend/src/components/purchases/ManualPurchasesTab.tsx` (passer isActive)
- `apps/frontend/src/components/purchases/PurchaseFormDialog.tsx` (conserver réinjection)
- `apps/frontend/src/components/purchases/PurchaseDetailDialog.tsx` (badge)
- `apps/frontend/src/components/inventory/InventoryLinesTable.tsx` (badge)
- `apps/frontend/src/components/products/import/ProductImportPreviewTable.tsx` (warnings)
- `apps/frontend/src/pages/products/ProductsPage.tsx` (rien si toggle déjà présent)

### Demande 2

**Backend**
- `apps/backend/src/modules/financial-reports/financial-reports.service.ts` (lignes 301, 350)
- `apps/backend/src/modules/exports/exports.service.ts` (lignes 1082, 1100-1106, 1157 — libellés)

**Frontend**
- `apps/frontend/src/pages/financial-reports/FinancialReportsPage.tsx` (libellé/tooltip)

**Optionnels (phase 2.4)**
- `apps/backend/src/modules/financial-reports/financial-reports.controller.ts` (nouveau `POST /:id/relock`)
- `apps/backend/scripts/relock-historical.ts` (**nouveau**, alternative CLI)

---

## 20. Questions métier à faire valider par le client

### Demande 1

- **Q1** — Cross-branch copy : quand on demande de copier un produit
  vers l'autre branche et qu'un jumeau **inactif** existe déjà là-bas,
  faut-il : (a) répondre `alreadyExisted` (comportement actuel) ;
  (b) le réactiver ; (c) créer un doublon actif (nouveau row) ?
- **Q2** — Import Excel : quand un produit importé matche un nom
  **inactif**, faut-il : (a) refuser la ligne ; (b) réactiver
  silencieusement (comportement actuel) ; (c) demander confirmation via
  un flag `--reactivate` dans le UI de preview ?
- **Q3** — Hard-delete : le message métier de refus (« ce produit
  apparaît dans X achats »), doit-il proposer un lien direct vers ces
  achats/lignes historiques ?
- **Q4** — Bouton Delete : accessible à **`MANAGE_PRODUCTS`** (même
  permission que soft-delete) ou réservé à `OWNER/ADMIN` ?
- **Q5** — Réactivation d'un produit inactif après achat historique :
  quand on réactive un produit qui a été inactif pendant plusieurs
  périodes, doit-on créer des `InventoryLine` rétrospectives pour ces
  périodes (probablement non — mais confirmer) ?

### Demande 2

- **Q6** — LOCKED historiques : doit-on **re-locker** les rapports
  passés pour aligner l'historique sur HT, ou les laisser figés en TTC
  (mémoire figée) ?
- **Q7** — Lignes suspectes (HT=0 & TTC>0) découvertes par la pré-flight
  query : (a) ignorer et laisser à 0 dans le nouveau rapport ;
  (b) fallback logique `COALESCE(amountBeforeTax, totalAmount)` ;
  (c) demander à l'utilisateur de rééditer chaque ligne ?
- **Q8** — Politique DRAFT : un rapport DRAFT du mois passé change
  automatiquement au prochain refresh — souhaite-t-on un flag « ce
  rapport a été affecté par le changement de règle » visible dans l'UI ?
- **Q9** — Rapports d'exports PDF/Excel historiques : doit-on renommer
  toutes les colonnes « Montant » en « Montant (HT) » globalement, ou
  seulement dans le rapport financier ?
- **Q10** — Repair : les réparations sont aujourd'hui en TTC dans le
  rapport et passeraient à HT. Confirmer que c'est le comportement
  attendu (le client l'a implicitement demandé mais pas nommément).

---

## Verdict par demande

### Demande 1 — Désactivation + suppression des produits

- ✅ **Faisable sans migration Prisma.**
- ✅ **Faisable avec modification backend + frontend.**
- ⚠ **Requiert nouvel endpoint** (`DELETE /:id/hard`) + endpoint
  auxiliaire (`GET /:id/references`) + nouvelle méthode service.
- ⚠ **Risque sur l'historique** : ÉLEVÉ si l'on ajoute aveuglément
  `isActive: true` à toutes les queries — la stratégie recommandée
  (filtrage sélectif par contexte opérationnel, sans toucher aux queries
  historiques) évite ce risque. Bien respecter la classification §5.
- 🎯 **Décision métier requise** avant implémentation : Q1, Q2, Q4
  (permissions).

### Demande 2 — Rapport financier en HT

- ✅ **Faisable sans migration Prisma** — `amountBeforeTax` est NOT NULL
  DEFAULT 0 depuis le premier commit de la table.
- ✅ **Faisable avec modification backend + libellés frontend** — le
  cœur du changement est **littéralement une ligne** dans
  `financial-reports.service.ts:301`.
- ⚠ **Risque sur l'historique DRAFT** : ÉLEVÉ si non communiqué —
  tous les DRAFT changent au prochain refresh. Aucun risque sur les
  LOCKED tant qu'on ne re-lock pas.
- 🎯 **Décision métier requise** avant implémentation : Q6 (re-lock
  historique), Q7 (rows aberrantes HT=0), Q10 (Repair TTC→HT confirmé).
- 🔎 **Action préalable obligatoire** : exécuter la requête pré-flight
  §13.2 en prod ; si résultat > 0, résoudre avant de flipper.

---

_Fin de l'audit read-only. Aucun fichier modifié._
