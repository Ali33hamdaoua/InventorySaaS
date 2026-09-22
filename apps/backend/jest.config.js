/**
 * Jest config pour @inventorymdb/backend.
 *
 * Périmètre de cette livraison (Lot 1) : tests unitaires ciblant les
 * services du cycle de vie Produit + preview/confirm import + garde-fou
 * inactif sur les achats. Utilise `jest-mock` en substitution du client
 * Prisma pour rester déterministe sans DB.
 *
 * Les tests d'intégration bout-en-bout (SUPERTEST + DB) restent le
 * chantier suivant — non requis par ce lot.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^@inventorymdb/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@inventorymdb/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/modules/products/**/*.ts',
    'src/modules/purchases/**/*.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.module.ts',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
