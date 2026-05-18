/**
 * `/verify/documents` — the identity-documents step of the "Get verified" checklist.
 * Drivers upload Aadhaar (front & back), a driving licence and a selfie (+ the masked Aadhaar
 * last-4, licence number/expiry); trip managers upload Aadhaar (front & back) and a selfie only.
 * Submitting moves `kyc_status` → docs_submitted.
 */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { useMyAgent, useMyDriver, useSubmitAgentKycDocs, useSubmitDriverKycDocs } from '@/hooks/useDrivers';
import { getAgentKycDocUploadUrl, getDriverKycDocUploadUrl } from '@/lib/api/services/drivers';
import { PageHeader, PageShell } from '@/components/layout';
import { Button, Card, Input, StatusBanner } from '@/components/ui';
import { FileUpload } from '@/components/form';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { AgentKycDocType, DriverKycDocType } from '@/types';

/** Today's date as `YYYY-MM-DD` in the browser TZ — used as `min` on the DL expiry input
 *  so a typo can't land the year at 1930 (the apply-to-trip eligibility check would then
 *  block the driver forever with a confusing "expired" error). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <PageHeader title="Identity documents" backTo="/profile" />
      {children}
    </PageShell>
  );
}

function AlreadySubmittedNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <StatusBanner tone="success" icon={<ShieldCheck />} title="You've already submitted your documents. You can re-upload below if asked." />
  );
}

function ConsentRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-xs text-secondary">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>I consent to TripKing storing these documents securely for KYC verification, in line with UIDAI guidelines for Aadhaar.</span>
    </label>
  );
}

function DriverDocsForm({ tripId }: { tripId: string | null }) {
  const navigate = useNavigate();
  const driverQuery = useMyDriver();
  const submit = useSubmitDriverKycDocs();

  const [paths, setPaths] = useState<Partial<Record<DriverKycDocType, string>>>({});
  const [last4, setLast4] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [dlExpiry, setDlExpiry] = useState('');
  const [consent, setConsent] = useState(false);

  if (driverQuery.isPending) return <div className="p-6"><LoadingSkeleton rows={6} /></div>;
  if (driverQuery.isError || !driverQuery.data) return <div className="p-6"><ErrorState title="Couldn't load your profile" onRetry={() => driverQuery.refetch()} /></div>;
  const driver = driverQuery.data;
  const set = (t: DriverKycDocType) => (path: string) => setPaths((p) => ({ ...p, [t]: path }));
  const uploadUrlFor = (t: DriverKycDocType) => () => getDriverKycDocUploadUrl(driver.id, t);

  const last4ok = /^\d{4}$/.test(last4);
  const ready = !!paths.aadhaar_front && !!paths.aadhaar_back && !!paths.driver_license && !!paths.selfie && last4ok && dlNumber.trim().length > 0 && consent && !submit.isPending;

  async function onSubmit() {
    // Guard against direct keyboard entry that bypassed the picker's `min` attribute
    // (some mobile browsers don't enforce it). The eligibility check on apply uses
    // this date — a past value would otherwise quietly block every apply attempt.
    if (dlExpiry && dlExpiry < todayIso()) {
      toast.error("Driver licence expiry can't be in the past.");
      return;
    }
    try {
      await submit.mutateAsync({
        driverId: driver.id,
        input: {
          aadhaarFrontPath: paths.aadhaar_front as string,
          aadhaarBackPath: paths.aadhaar_back as string,
          aadhaarLast4: last4,
          driverLicensePath: paths.driver_license as string,
          driverLicenseNumber: dlNumber.trim(),
          driverLicenseExpiry: dlExpiry || undefined,
          selfiePath: paths.selfie as string,
          consent: true,
        },
      });
      toast.success("Documents submitted — we'll review them shortly.");
      navigate('/profile');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit your documents');
    }
  }

  return (
    <PageWrap>
      <div className="space-y-4">
        {tripId ? (
          <StatusBanner tone="info" title="One step away from applying">
            Complete your identity verification below. Once approved, you can apply for trips right away.
          </StatusBanner>
        ) : null}
        <AlreadySubmittedNote show={driver.verification?.steps.documents === 'done'} />
        <p className="text-sm text-secondary">
          We use these to confirm you're a real, licensed driver. <strong>Only admins</strong> see them during review, and your full Aadhaar number is never stored — only the last 4 digits.
        </p>

        <Card className="gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FileUpload label="Aadhaar — front" required value={undefined} getUploadUrl={uploadUrlFor('aadhaar_front')} onUploaded={set('aadhaar_front')} />
            <FileUpload label="Aadhaar — back" required value={undefined} getUploadUrl={uploadUrlFor('aadhaar_back')} onUploaded={set('aadhaar_back')} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="last4" className="text-sm font-medium">Aadhaar — last 4 digits<span className="text-destructive"> *</span></label>
            <Input id="last4" inputMode="numeric" maxLength={4} placeholder="1234" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            {last4.length > 0 && !last4ok && <p className="text-xs text-destructive">Enter exactly the last 4 digits.</p>}
          </div>
        </Card>

        <Card className="gap-4">
          <FileUpload label="Driving licence" required allowPdf value={undefined} getUploadUrl={uploadUrlFor('driver_license')} onUploaded={set('driver_license')} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="dln" className="text-sm font-medium">Licence number<span className="text-destructive"> *</span></label>
              <Input id="dln" placeholder="TN09 20200001234" value={dlNumber} onChange={(e) => setDlNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dlx" className="text-sm font-medium">Expiry date</label>
              {/* `min=today` blocks the browser picker from accepting a past year
               *  (a typo like '30' would otherwise land at 1930, blocking apply forever). */}
              <Input id="dlx" type="date" min={todayIso()} value={dlExpiry} onChange={(e) => setDlExpiry(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="gap-3">
          <FileUpload label="Selfie" hint="A clear photo of your face — we match it on the video call." required capture="user" value={undefined} getUploadUrl={uploadUrlFor('selfie')} onUploaded={set('selfie')} />
        </Card>

        <ConsentRow checked={consent} onChange={setConsent} />

        <Button variant="full" size="lg" disabled={!ready} onClick={onSubmit}>
          {submit.isPending ? 'Submitting…' : 'Submit for verification'}
        </Button>
      </div>
    </PageWrap>
  );
}

function AgentDocsForm({ tripId }: { tripId: string | null }) {
  const navigate = useNavigate();
  const agentQuery = useMyAgent();
  const submit = useSubmitAgentKycDocs();

  const [paths, setPaths] = useState<Partial<Record<AgentKycDocType, string>>>({});
  const [last4, setLast4] = useState('');
  const [consent, setConsent] = useState(false);

  if (agentQuery.isPending) return <div className="p-6"><LoadingSkeleton rows={6} /></div>;
  if (agentQuery.isError || !agentQuery.data) return <div className="p-6"><ErrorState title="Couldn't load your profile" onRetry={() => agentQuery.refetch()} /></div>;
  const agent = agentQuery.data;
  const set = (t: AgentKycDocType) => (path: string) => setPaths((p) => ({ ...p, [t]: path }));
  const uploadUrlFor = (t: AgentKycDocType) => () => getAgentKycDocUploadUrl(agent.id, t);

  const last4ok = /^\d{4}$/.test(last4);
  const ready = !!paths.aadhaar_front && !!paths.aadhaar_back && !!paths.selfie && last4ok && consent && !submit.isPending;

  async function onSubmit() {
    try {
      await submit.mutateAsync({
        agentId: agent.id,
        input: {
          aadhaarFrontPath: paths.aadhaar_front as string,
          aadhaarBackPath: paths.aadhaar_back as string,
          aadhaarLast4: last4,
          selfiePath: paths.selfie as string,
          consent: true,
        },
      });
      toast.success("Documents submitted — we'll review them shortly.");
      navigate('/profile');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit your documents');
    }
  }

  return (
    <PageWrap>
      <div className="space-y-4">
        {tripId ? (
          <StatusBanner tone="info" title="One step away from applying">
            Complete your identity verification below. Once approved, you can apply for trips right away.
          </StatusBanner>
        ) : null}
        <AlreadySubmittedNote show={agent.verification?.steps.documents === 'done'} />
        <p className="text-sm text-secondary">
          We use these to confirm who you are. <strong>Only admins</strong> see them during review, and your full Aadhaar number is never stored — only the last 4 digits.
        </p>

        <Card className="gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FileUpload label="Aadhaar — front" required value={undefined} getUploadUrl={uploadUrlFor('aadhaar_front')} onUploaded={set('aadhaar_front')} />
            <FileUpload label="Aadhaar — back" required value={undefined} getUploadUrl={uploadUrlFor('aadhaar_back')} onUploaded={set('aadhaar_back')} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="last4" className="text-sm font-medium">Aadhaar — last 4 digits<span className="text-destructive"> *</span></label>
            <Input id="last4" inputMode="numeric" maxLength={4} placeholder="1234" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            {last4.length > 0 && !last4ok && <p className="text-xs text-destructive">Enter exactly the last 4 digits.</p>}
          </div>
        </Card>

        <Card className="gap-3">
          <FileUpload label="Selfie" hint="A clear photo of your face — we match it on the video call." required capture="user" value={undefined} getUploadUrl={uploadUrlFor('selfie')} onUploaded={set('selfie')} />
        </Card>

        <ConsentRow checked={consent} onChange={setConsent} />

        <Button variant="full" size="lg" disabled={!ready} onClick={onSubmit}>
          {submit.isPending ? 'Submitting…' : 'Submit for verification'}
        </Button>
      </div>
    </PageWrap>
  );
}

export function VerifyDocumentsPage() {
  const effectiveRole = useEffectiveRole();
  const [searchParams] = useSearchParams();
  const tripId = searchParams.get('tripId');
  return effectiveRole === 'trip_manager' ? <AgentDocsForm tripId={tripId} /> : <DriverDocsForm tripId={tripId} />;
}

export default VerifyDocumentsPage;
