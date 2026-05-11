import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  /** Heading. Defaults to "Trip not found". */
  title?: string;
  /** Body copy. Defaults to the stale-link explanation. */
  message?: string;
  /** CTA label. Defaults to "Browse open trips". */
  ctaLabel?: string;
  /** CTA target route. Defaults to "/driver/trips". */
  ctaTo?: string;
}

/**
 * Friendly empty state for when a trip can't be resolved by id.
 *
 * Share links are clean (`/driver/trips/<id>`), so a link opened on a
 * different device than it was posted from — or after the trip was filled
 * or removed — won't resolve. This explains that instead of dead-ending on
 * a bare "Trip not found." line.
 */
export function TripNotFound({
  title = 'Trip not found',
  message = "This link may be out of date — the trip might have been filled or removed, or it was opened on a different device than the one it was posted from.",
  ctaLabel = 'Browse open trips',
  ctaTo = '/driver/trips',
}: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-sm w-full">
        <CardContent className="flex flex-col items-center text-center gap-4 py-8">
          <div className="size-14 rounded-full bg-gray-100 flex items-center justify-center">
            <MapPinOff className="size-7 text-gray-400" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <Button asChild variant="full" size="lg" className="w-full">
            <Link to={ctaTo}>{ctaLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default TripNotFound;
