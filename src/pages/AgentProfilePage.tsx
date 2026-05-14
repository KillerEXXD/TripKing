import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { useAgent } from '@/hooks/useDrivers';
import { useDriverReviews } from '@/hooks/useReviews';
import { ReviewList } from '@/components/reviews/ReviewList';
import { Badge, Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { initials } from '@/lib/utils';
import type { Agent, KycStatus } from '@/types';

const KYC_BADGE: Record<KycStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  pending: { label: 'Verification pending', variant: 'muted' },
  docs_submitted: { label: 'Docs submitted', variant: 'info' },
  video_pending: { label: 'Video call pending', variant: 'info' },
  ready_for_approval: { label: 'Ready for approval', variant: 'success' },
  approved: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Verification rejected', variant: 'destructive' },
  resubmit_required: { label: 'Resubmit documents', variant: 'warning' },
};

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) return <img src={url} alt="" className="size-16 shrink-0 rounded-full object-cover" />;
  return (
    <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary" aria-hidden>
      {name ? initials(name) : '?'}
    </div>
  );
}

function AgentDetail({ agent }: { agent: Agent }) {
  const kyc = KYC_BADGE[agent.kycStatus] ?? KYC_BADGE.pending;
  // `phone` is required on the revealed `Agent` shape but the server returns a pre-reveal row
  // (no identity fields) to viewers who haven't crossed the reveal gate — guard before rendering.
  const phone = agent.phone || '';
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined;
  const reviewsQuery = useDriverReviews(agent.userId);
  const reviews = reviewsQuery.data ?? [];
  const primary = agent.fullName || `Agent ${agent.displayHandle}`;
  return (
    <div className="space-y-4">
      <Card className="gap-3">
        <div className="flex items-start gap-3">
          <Avatar name={primary} url={agent.profilePhotoUrl || undefined} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{primary}</h1>
            {agent.displayHandle ? (
              <div className="font-mono text-[11px] uppercase tracking-wide text-secondary">{agent.displayHandle}</div>
            ) : null}
            <div className="mt-1 flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-secondary" aria-hidden />
              <Badge variant={kyc.variant}>{kyc.label}</Badge>
            </div>
            <div className="mt-1.5 text-sm text-secondary">{agent.totalTripsPosted} trips posted</div>
          </div>
        </div>
        {telHref ? (
          <Button asChild variant="outline" size="sm" className="w-fit">
            <a href={telHref} aria-label={`Call ${primary}`}>
              <Phone className="size-4" aria-hidden /> Call
            </a>
          </Button>
        ) : null}
      </Card>

      {agent.topTags.length > 0 ? (
        <Card className="gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">What drivers say</div>
          <div className="flex flex-wrap gap-1.5">
            {agent.topTags.map((t) => (
              <Badge key={t} variant="success">
                ★ {t}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}

      {agent.businessName || agent.businessCity ? (
        <Card className="gap-2">
          {agent.businessName ? (
            <div className="flex items-start gap-3 text-sm">
              <Building2 className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
              <div>{agent.businessName}</div>
            </div>
          ) : null}
          {agent.businessCity ? (
            <div className="flex items-start gap-3 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
              <div>
                <span className="text-secondary">Based in: </span>
                {agent.businessCity.name}
                {agent.businessCity.state ? `, ${agent.businessCity.state}` : ''}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Reviews</div>
        {reviewsQuery.isPending ? (
          <LoadingSkeleton rows={2} />
        ) : reviewsQuery.isError ? (
          <p className="text-sm text-secondary">Couldn&apos;t load reviews.</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-secondary">No written reviews yet.</p>
        ) : (
          <ReviewList reviews={reviews} />
        )}
      </div>
    </div>
  );
}

/** `/agents/:id` — a trip manager's public profile (KYC, business, reviews from drivers). Read via `useAgent`. */
export function AgentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const agentQuery = useAgent(id);
  const notFound = !id || (agentQuery.isError && agentQuery.error instanceof ApiError && agentQuery.error.status === 404);

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="text-base font-semibold">Agent</div>
      </header>

      <div className="space-y-4 p-4">
        {notFound ? (
          <ErrorState title="Agent not found" message="This profile may have been removed, or the link is out of date." />
        ) : agentQuery.isPending ? (
          <LoadingSkeleton rows={6} />
        ) : agentQuery.isError ? (
          <ErrorState title="Couldn't load this profile" message="Check your connection and try again." onRetry={() => void agentQuery.refetch()} />
        ) : (
          <AgentDetail agent={agentQuery.data} />
        )}
      </div>
    </div>
  );
}

export default AgentProfilePage;
