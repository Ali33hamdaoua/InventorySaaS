/**
 * Packaging / Unit conversion — helper partagé (frontend + backend + futur mobile).
 *
 * RÈGLES INVIOLABLES (documentées dans l'audit) :
 *   1. L'unité de base est TOUJOURS la plus petite unité consommable
 *      (pièce, gramme, litre…). C'est ce que la DB stocke exclusivement.
 *   2. Le "packaging" (carton / box / pack / sac / palette) est une VUE
 *      utilisateur alternative pour saisir plus vite. Jamais une couche
 *      de stockage.
 *   3. Le facteur (`packagingFactor`) = combien d'unités de base contient
 *      UN packaging. Strictement positif. Absent ou 0 → produit unitaire
 *      (pas de conditionnement).
 *
 * Tous les helpers sont des PURE FUNCTIONS déterministes, sans effet de
 * bord, sans accès DB, sans I/O. Testables trivialement.
 */

/**
 * Convertit une saisie mixte (X packagings + Y unités) en unité de base.
 *
 *   toBaseUnits(2, 4, 12)  → 28  (2 cartons × 12 + 4 pièces)
 *   toBaseUnits(0, 15, 12) → 15  (produit conditionné mais saisi en pièces seules)
 *   toBaseUnits(3, 0, null) → 0  (produit unitaire mais on ignore les packagings puisqu'il n'y en a pas)
 *   toBaseUnits(0, 42, null) → 42 (produit unitaire, saisie directe)
 *
 * Cas de sécurité :
 *   - factor null/undefined/≤0 → mode "unitaire" : on retourne juste `units`,
 *     `packagings` est ignoré (protection contre une saisie parasite si le
 *     produit n'a pas de packaging).
 *   - NaN / valeurs négatives → normalisées à 0 (jamais de nombre négatif
 *     ou NaN qui polluerait un calcul de stock).
 */
export function toBaseUnits(
  packagings: number,
  units: number,
  factor: number | null | undefined,
): number {
  const safePkg = Number.isFinite(packagings) && packagings > 0 ? packagings : 0;
  const safeUnits = Number.isFinite(units) && units > 0 ? units : 0;
  if (!factor || !Number.isFinite(factor) || factor <= 0) {
    return safeUnits;
  }
  return safePkg * factor + safeUnits;
}

/**
 * Décompose une quantité en (packagings entiers, unités restantes).
 * Utilisé pour PROPOSER une décomposition à l'utilisateur quand il ouvre
 * un formulaire d'édition et voit une quantité stockée.
 *
 *   fromBaseUnits(28, 12)   → { packagings: 2, units: 4 }
 *   fromBaseUnits(36, 12)   → { packagings: 3, units: 0 }
 *   fromBaseUnits(5, 12)    → { packagings: 0, units: 5 }
 *   fromBaseUnits(42, null) → { packagings: 0, units: 42 }
 *
 * Cas de sécurité :
 *   - factor absent/invalide → { packagings: 0, units: quantity }
 *   - quantity négatif/NaN → { packagings: 0, units: 0 }
 */
export function fromBaseUnits(
  quantity: number,
  factor: number | null | undefined,
): { packagings: number; units: number } {
  const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  if (!factor || !Number.isFinite(factor) || factor <= 0) {
    return { packagings: 0, units: safeQty };
  }
  const packagings = Math.floor(safeQty / factor);
  const units = safeQty - packagings * factor;
  return { packagings, units };
}

/**
 * Convertit un prix par packaging en prix par unité de base.
 * Utilisé UNIQUEMENT comme aide UI ("prix carton → prix pièce proposé").
 * Le prix final envoyé à l'API reste choisi librement par l'utilisateur
 * (Règle n°2 : le prix unitaire n'est jamais recalculé automatiquement
 * côté backend, l'utilisateur peut le modifier).
 *
 *   packagingPriceToUnitPrice(240, 12) → 20
 *   packagingPriceToUnitPrice(240, 0)  → 0 (garde-fou anti-division-par-zéro)
 *
 * Précision : le résultat n'est PAS arrondi ici — c'est à la couche
 * d'affichage (formulaire) de décider combien de décimales garder,
 * cohérent avec le stockage `Decimal(14, 4)` côté DB.
 */
export function packagingPriceToUnitPrice(
  packagingPrice: number,
  factor: number | null | undefined,
): number {
  if (
    !Number.isFinite(packagingPrice) ||
    !factor ||
    !Number.isFinite(factor) ||
    factor <= 0
  ) {
    return 0;
  }
  return packagingPrice / factor;
}

/**
 * Convertit un prix par unité de base en prix par packaging.
 * Inverse de la fonction précédente.
 *
 *   unitPriceToPackagingPrice(20, 12) → 240
 */
export function unitPriceToPackagingPrice(
  unitPrice: number,
  factor: number | null | undefined,
): number {
  if (
    !Number.isFinite(unitPrice) ||
    !factor ||
    !Number.isFinite(factor) ||
    factor <= 0
  ) {
    return 0;
  }
  return unitPrice * factor;
}

/**
 * True si le produit a un conditionnement effectif (name + factor valides).
 * Utile pour brancher/débrancher l'UI dual-input de manière déclarative.
 */
export function hasPackaging(
  packagingName: string | null | undefined,
  packagingFactor: number | null | undefined,
): boolean {
  return (
    !!packagingName &&
    packagingName.trim().length > 0 &&
    Number.isFinite(packagingFactor as number) &&
    (packagingFactor as number) > 0
  );
}

/**
 * Suggestions par défaut pour la liste déroulante du champ « Nom du
 * conditionnement ». Le formulaire peut en accepter d'autres en saisie
 * libre (Règle n°6 : la liste doit rester configurable). C'est juste
 * une aide à la saisie, pas une contrainte de validation.
 */
export const DEFAULT_PACKAGING_NAMES: readonly string[] = [
  'Carton',
  'Box',
  'Pack',
  'Sac',
  'Palette',
  'Caisse',
  'Bidon',
  'Rouleau',
];
