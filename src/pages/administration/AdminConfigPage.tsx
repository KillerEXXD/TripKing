import { Card } from '@/components/ui';

/**
 * Reference-data manager — stub.
 *
 * Phase 2 replaces this with the full master-data UI (tabbed list editor,
 * makes-&-models master-detail, review-tags-by-category, the app-settings
 * form) wired to `useAdminConfig` / `/admin/*` — see §7 of the spec.
 */
export function AdminConfigPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-3 p-6">
      <h1 className="text-2xl font-bold">Reference data</h1>
      <Card>
        <p className="text-sm text-secondary">
          The configuration manager (car types, fuel types, vehicle makes &amp; models, seat options, cities,
          languages, review tags, cancellation reasons, app settings) is being wired in Phase 2.
        </p>
      </Card>
    </main>
  );
}

export default AdminConfigPage;
