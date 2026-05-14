import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Send, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input } from '@/components/ui';
import { usePostBugReport, useUploadBugAttachment } from '@/hooks/useBugReports';
import { formatLogBuffer } from '@/lib/logBuffer';
import { getBreadcrumbs } from '@/lib/breadcrumbBuffer';
import { getBugContext } from '@/lib/bugContextRegistry';
import { snapshotQueryCache } from '@/lib/queryCacheSnapshot';
import { APP_VERSION } from '@/version';
import { BUG_CATEGORIES, BUG_PRIORITIES, type BugCategory, type BugPriority } from '@/types';

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

interface Pending {
  file: File;
  preview: string;
}

export interface BugReportModalProps {
  onClose: () => void;
}

/**
 * Submission form for `POST /bug-reports`. Auto-attaches console logs,
 * breadcrumbs, app/route/version metadata, the page-registered bug context
 * and a privacy-safe query-cache snapshot. Uploads up to 5 screenshots
 * (5 MB each) via the signed-URL flow.
 */
export function BugReportModal({ onClose }: BugReportModalProps) {
  const qc = useQueryClient();
  const postBug = usePostBugReport();
  const upload = useUploadBugAttachment();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [priority, setPriority] = useState<BugPriority>('medium');
  const [category, setCategory] = useState<BugCategory>('other');
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cleanup blob URLs on unmount / list change.
  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, [pending]);

  const consoleLogs = useMemo(() => formatLogBuffer(), []);

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const next: Pending[] = [];
    for (let i = 0; i < files.length; i++) {
      if (pending.length + next.length >= MAX_FILES) {
        setError(`Max ${MAX_FILES} screenshots`);
        break;
      }
      const f = files[i];
      if (!ALLOWED_TYPES.includes(f.type)) {
        setError(`Unsupported file type: ${f.name}`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`File too large: ${f.name} (max 5 MB)`);
        continue;
      }
      next.push({ file: f, preview: URL.createObjectURL(f) });
    }
    if (next.length) setPending((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAt(idx: number) {
    setPending((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  const canSubmit = title.trim().length > 0 && !postBug.isPending && !upload.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    try {
      const sentryReplayUrl = readGlobalSentryReplayUrl();
      const posthog = readPosthogSession();

      const created = await postBug.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        stepsToReproduce: stepsToReproduce.trim(),
        expected: expected.trim(),
        actual: actual.trim(),
        priority,
        category,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        route: typeof window !== 'undefined' ? window.location.pathname : '',
        browserInfo: readBrowserInfo(),
        appVersion: APP_VERSION,
        consoleLogs,
        breadcrumbs: getBreadcrumbs(),
        context: getBugContext(),
        queryCacheSnapshot: snapshotQueryCache(qc),
        sentryReplayUrl,
        posthogSessionUrl: posthog?.url,
        posthogSessionId: posthog?.id,
      });

      // Upload attachments after the bug is created (so we have the bug id).
      for (const p of pending) {
        try {
          await upload.mutateAsync({ bugId: created.id, file: p.file });
        } catch (err) {
          // Log + continue — the bug is already filed, attachments are best-effort.
          toast.error(`Couldn't attach ${p.file.name}`);
          // eslint-disable-next-line no-console
          console.warn('bug-report attachment upload failed', err);
        }
      }

      toast.success(`Bug filed (${created.bugNumber}) — thanks!`);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submit failed';
      setError(message);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => (o ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-card p-4 shadow-xl"
          aria-describedby={undefined}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold">Report a bug</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-secondary hover:text-foreground">
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
            <label className="block text-sm font-medium">
              Title <span className="text-destructive">*</span>
              <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Short summary" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Priority
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as BugPriority)}
                >
                  {BUG_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Category
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as BugCategory)}
                >
                  {BUG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium">
              What happened?
              <textarea
                className="mt-1 h-20 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the problem in your own words"
              />
            </label>

            <label className="block text-sm font-medium">
              Steps to reproduce
              <textarea
                className="mt-1 h-20 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono text-xs"
                value={stepsToReproduce}
                onChange={(e) => setStepsToReproduce(e.target.value)}
                placeholder={'1. Open …\n2. Tap …\n3. See …'}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Expected
                <textarea
                  className="mt-1 h-16 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Actual
                <textarea
                  className="mt-1 h-16 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                />
              </label>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">Screenshots (optional)</p>
              <label
                htmlFor="bug-screenshot-input"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input p-3 text-sm text-secondary hover:bg-muted"
              >
                <Upload className="size-4" aria-hidden />
                <span>Click to upload (max {MAX_FILES} × 5 MB)</span>
                <input
                  ref={fileInputRef}
                  id="bug-screenshot-input"
                  type="file"
                  multiple
                  accept={ALLOWED_TYPES.join(',')}
                  onChange={pickFiles}
                  className="hidden"
                />
              </label>
              {pending.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {pending.map((p, idx) => (
                    <div key={idx} className="relative">
                      <img src={p.preview} alt={p.file.name} className="h-16 w-full rounded-md object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAt(idx)}
                        aria-label={`Remove ${p.file.name}`}
                        className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? (
              <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
                <AlertCircle className="size-4" aria-hidden /> {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={!canSubmit}>
                <Send className="size-4" aria-hidden />
                {postBug.isPending || upload.isPending ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function readBrowserInfo(): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return { userAgent: '', language: '', platform: '', viewport: { width: 0, height: 0 }, online: true };
  }
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    online: typeof navigator.onLine === 'boolean' ? navigator.onLine : true,
  };
}

interface SentryReplayLike {
  getReplayId?: () => string | undefined;
}
interface SentryGlobal { getReplay?: () => SentryReplayLike | undefined }
function readGlobalSentryReplayUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { Sentry?: SentryGlobal };
  const id = w.Sentry?.getReplay?.()?.getReplayId?.();
  return id ? `https://sentry.io/replays/${id}/` : undefined;
}

interface PosthogGlobal {
  get_session_id?: () => string | undefined;
  get_session_replay_url?: () => string | undefined;
}
function readPosthogSession(): { id?: string; url?: string } | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { posthog?: PosthogGlobal };
  const id = w.posthog?.get_session_id?.();
  const url = w.posthog?.get_session_replay_url?.();
  if (!id && !url) return undefined;
  return { id, url };
}

export default BugReportModal;
