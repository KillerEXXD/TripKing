/**
 * <FileUpload> — pick (or camera-capture) one image, client-side compress it, PUT it straight
 * to Supabase Storage via a short-lived signed URL minted by the API, then hand the resulting
 * object path back to the caller (which stores it on the row). Used by the KYC-documents and
 * vehicle-photos screens. Nothing here touches the Supabase client.
 */
import { useId, useRef, useState } from 'react';
import { Camera, FileText, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { compressImageFile, uploadToSignedUrl } from '@/lib/api/upload';
import type { UploadUrlResponse } from '@/types';

export interface FileUploadProps {
  /** Field label, e.g. "Aadhaar — front". */
  label: string;
  /** Helper line under the label. */
  hint?: string;
  /** A current image to preview (a short-lived signed download URL), or empty if none yet. */
  value?: string;
  /** Mints the signed upload URL (already bound to the doc-type / vehicle-photo slot). */
  getUploadUrl: () => Promise<UploadUrlResponse>;
  /** Called with the uploaded object path once the PUT succeeds. */
  onUploaded: (path: string, res: UploadUrlResponse) => void;
  /** Also accept PDFs (e.g. RC book / insurance scans). */
  allowPdf?: boolean;
  /** Hint mobile browsers to open the camera directly ('user' = front/selfie, 'environment' = rear). Omit to let the user pick a file or take a photo. */
  capture?: 'user' | 'environment';
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function FileUpload({ label, hint, value, getUploadUrl, onUploaded, allowPdf = false, capture, required, disabled, className }: FileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);

  const preview = localPreview ?? value ?? '';
  const accept = allowPdf ? 'image/*,application/pdf' : 'image/*';

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setError(null);
    setUploading(true);
    let objectUrl: string | null = null;
    try {
      const res = await getUploadUrl();
      const blob = await compressImageFile(file);
      await uploadToSignedUrl(res.signedUrl, blob);
      objectUrl = URL.createObjectURL(blob);
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(objectUrl);
      setIsPdf(file.type === 'application/pdf');
      onUploaded(res.path, res);
    } catch (err) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setError(err instanceof Error ? err.message : 'Upload failed — try again');
    } finally {
      setUploading(false);
    }
  }

  const hasFile = !!preview || isPdf;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
        {hasFile && !uploading && (
          <button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-medium text-primary hover:underline" disabled={disabled}>
            Replace
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors',
          'h-36 text-muted-foreground hover:border-primary/60 hover:bg-muted/40 disabled:opacity-60',
          error ? 'border-destructive/60' : hasFile ? 'border-emerald-300 bg-emerald-50/40' : 'border-input',
        )}
      >
        {uploading ? (
          <span className="flex flex-col items-center gap-1 text-sm">
            <Loader2 className="size-6 animate-spin" /> Uploading…
          </span>
        ) : isPdf ? (
          <span className="flex flex-col items-center gap-1 text-sm text-emerald-700">
            <FileText className="size-7" /> PDF uploaded
          </span>
        ) : preview ? (
          <img src={preview} alt={label} className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-sm">
            <Camera className="size-7" /> Tap to add a photo
          </span>
        )}
      </button>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <RefreshCw className="size-3" /> {error}
        </p>
      )}

      <input id={inputId} ref={inputRef} type="file" accept={accept} className="sr-only" onChange={onPick} disabled={disabled || uploading} {...(capture ? { capture } : {})} />
    </div>
  );
}
