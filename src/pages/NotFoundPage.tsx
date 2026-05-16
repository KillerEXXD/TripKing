import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/feedback';

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <EmptyState
        title="404 — page not found"
        message="That page doesn't exist."
        action={
          <Link to="/" className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800">
            Go home
          </Link>
        }
      />
    </main>
  );
}

export default NotFoundPage;
