-- =====================================================================
-- Ajoute la valeur `REOPEN_PERIOD` à l'enum AuditAction pour tracer la
-- réouverture d'une période d'inventaire clôturée. Owner/Admin seulement
-- via la permission BYPASS_CLOSED_PERIOD (déjà en place).
-- =====================================================================

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REOPEN_PERIOD';
