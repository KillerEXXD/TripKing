import { ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui';
import { LoadingSkeleton } from '@/components/feedback';
import { useDriverKycDocs, useAgentKycDocs } from '@/hooks/useDrivers';
import type { KycDocs } from '@/types';

/**
 * "Your documents" — shows the signed-in user's submitted KYC docs on `/profile`.
 * Aadhaar (front + back), Driver License (driver only), and the selfie used for
 * the video call gate. URLs are 5-minute signed download links from private
 * storage — they refresh on each query. Tap a row → opens the doc in a new tab.
 *
 * Renders nothing if the user hasn't submitted any docs yet (KYC stays in
 * `pending`); the VerificationChecklist next to it nudges them to submit.
 */
export function MyKycDocsCard({ kind, id }: { kind: 'driver' | 'agent'; id: string | undefined }) {
  const driverDocs = useDriverKycDocs(kind === 'driver' ? id : undefined);
  const agentDocs = useAgentKycDocs(kind === 'agent' ? id : undefined);
  const query = kind === 'driver' ? driverDocs : agentDocs;

  if (query.isPending) {
    return (
      <Card className="gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Your documents</div>
        <LoadingSkeleton rows={2} />
      </Card>
    );
  }

  const docs = query.data as KycDocs | undefined;
  if (!docs?.kycDocsSubmittedAt) return null;

  const submittedAt = (() => {
    try {
      const d = new Date(docs.kycDocsSubmittedAt!);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return null;
    }
  })();

  return (
    <Card className="gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Your documents</div>
        {submittedAt ? <span className="text-[10px] text-secondary">Submitted {submittedAt}</span> : null}
      </div>
      <ul className="space-y-1.5">
        {docs.aadhaarFrontUrl ? (
          <DocRow url={docs.aadhaarFrontUrl} label="Aadhaar — front" note={docs.aadhaarNumberMasked} />
        ) : null}
        {docs.aadhaarBackUrl ? (
          <DocRow url={docs.aadhaarBackUrl} label="Aadhaar — back" />
        ) : null}
        {docs.driverLicenseUrl ? (() => {
          const today = new Date().toISOString().slice(0, 10);
          const dlExpired = !!docs.driverLicenseExpiry && docs.driverLicenseExpiry < today;
          return (
            <DocRow
              url={docs.driverLicenseUrl}
              label="Driver License"
              note={[docs.driverLicenseNumber, docs.driverLicenseExpiry ? `expires ${docs.driverLicenseExpiry}${dlExpired ? ' · EXPIRED — please update' : ''}` : null].filter(Boolean).join(' · ')}
              noteTone={dlExpired ? 'danger' : undefined}
            />
          );
        })() : null}
        {docs.selfieUrl ? (
          <DocRow url={docs.selfieUrl} label="Selfie" icon="shield" />
        ) : null}
      </ul>
      <p className="mt-1 text-[10px] text-secondary">
        Links are valid for 5 minutes. Reload this page to refresh them.
      </p>
    </Card>
  );
}

function DocRow({ url, label, note, icon = 'doc', noteTone }: { url: string; label: string; note?: string | null; icon?: 'doc' | 'shield'; noteTone?: 'danger' }) {
  const Icon = icon === 'shield' ? ShieldCheck : FileText;
  return (
    <li>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition-colors hover:border-primary/40"
      >
        <Icon className="size-4 shrink-0 text-secondary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {note ? <span className={`block text-[11px] ${noteTone === 'danger' ? 'font-semibold text-red-700' : 'text-secondary'}`}>{note}</span> : null}
        </span>
        <ExternalLink className="size-3.5 shrink-0 text-secondary" aria-hidden />
      </a>
    </li>
  );
}

export default MyKycDocsCard;
