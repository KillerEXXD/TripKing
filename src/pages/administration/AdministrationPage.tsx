import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';

/** Admin hub. KYC queue, vehicle eligibility, translations, reviews moderation land in Phase 4. */
export function AdministrationPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Administration</h1>
      <Card>
        <h2 className="font-semibold">Reference data</h2>
        <p className="text-sm text-secondary">
          Car types · fuel types · vehicle makes &amp; models · seat options · cities · languages · review tags ·
          cancellation reasons · app settings.
        </p>
        <Link to="/administration/config" className="text-sm text-primary underline">
          Open the configuration manager →
        </Link>
      </Card>
      <p className="text-sm text-secondary">KYC queue · vehicle eligibility · translation manager · reviews moderation — Phase 4.</p>
    </main>
  );
}

export default AdministrationPage;
