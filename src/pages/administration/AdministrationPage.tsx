import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';

/** Admin hub — reference data + operations (KYC, vehicle eligibility, translations, reviews moderation). */
export function AdministrationPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Administration</h1>
      <Card className="gap-1">
        <h2 className="font-semibold">Reference data</h2>
        <p className="text-sm text-secondary">
          Car types · fuel types · vehicle makes &amp; models · seat options · cities · languages · review tags ·
          cancellation reasons · app settings.
        </p>
        <Link to="/administration/config" className="text-sm text-primary underline">
          Open the configuration manager →
        </Link>
      </Card>
      <Card className="gap-1">
        <h2 className="font-semibold">Operations</h2>
        <ul className="mt-1 space-y-1 text-sm">
          <li>
            <Link to="/administration/kyc" className="text-primary underline">
              KYC review queue →
            </Link>
          </li>
          <li>
            <Link to="/administration/vehicles" className="text-primary underline">
              Vehicle-eligibility dashboard →
            </Link>
          </li>
          <li>
            <Link to="/administration/reviews" className="text-primary underline">
              Reviews moderation →
            </Link>
          </li>
          <li className="text-secondary">Translation manager — coming up.</li>
        </ul>
      </Card>
    </main>
  );
}

export default AdministrationPage;
