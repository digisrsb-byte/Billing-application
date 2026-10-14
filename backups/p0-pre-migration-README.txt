SRK Enterprises Billing — P0 pre-migration backup notes
======================================================

Date: 2026-10-14
Scope: Approved P0 security remediation only

On first application load after this upgrade, storage.ts automatically copies the
existing localStorage database (key: srk_enterprises_billing_db_v2) to:

  srk_enterprises_billing_db_v2_backup_pre_p0_v3

before applying schema meta / integrity migrations. That backup is never deleted
by the migration and can be restored manually if needed.

Automated tests use a separate key:

  srk_enterprises_billing_db_TEST_p0

No production browser profile is modified by the Node test harness.
