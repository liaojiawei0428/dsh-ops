/**
 * dsh-computer-use — patch-only bundle row.
 *
 * This package deliberately ships no runtime behaviour: its substance is
 * `cordis.patch.yml`, which inserts the official computer-use service plus the
 * Cua Driver native provider. It exists because the enable step is an insert,
 * and the personal-hub manifest can only express id-targeted overrides of rows
 * that already exist.
 *
 * STANDARD COMPLIANCE (PLUGIN-STANDARD.md):
 *  - P1/P10: directory name = package name; the manifest declares the bundle patch.
 *  - P2 zero workspace imports, P3 no injections, P5 no registrations.
 *  - P6 nothing to fail loud at load: an empty apply cannot break the tree. The
 *    inserted provider rows own their own activation failures, and an optional
 *    row that fails to activate warns without tearing down the application.
 */

export const name = 'computer-use'

/** No hard dependencies: this row contributes no registration of its own. */
export const inject = []

/**
 * No-op body. The mounted capability belongs to the rows inserted by
 * `cordis.patch.yml`; this function exists because a function plugin must
 * export `apply`.
 * @param _ctx - host root context (unused).
 */
export function apply(_ctx) {}
