import { Link } from 'react-router-dom';
import { Card } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <p className="text-2xs font-semibold uppercase tracking-widest text-muted">404</p>
        <h1 className="mt-1 text-lg font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          This screen does not exist in the current build. Modules appear only once their backend
          works.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand-600">
          Back to the dashboard →
        </Link>
      </Card>
    </div>
  );
}
