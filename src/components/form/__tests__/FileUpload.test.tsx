import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FileUpload from '@/components/form/FileUpload';

vi.mock('@/lib/api/upload', () => ({
  compressImageFile: vi.fn(async (f: Blob) => f),
  uploadToSignedUrl: vi.fn(async () => undefined),
}));
import { uploadToSignedUrl } from '@/lib/api/upload';

beforeEach(() => {
  vi.mocked(uploadToSignedUrl).mockClear();
  if (typeof URL.createObjectURL !== 'function') {
    Object.assign(URL, { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} });
  } else {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  }
});

function renderWith(over: Partial<React.ComponentProps<typeof FileUpload>> = {}) {
  const onUploaded = vi.fn();
  const getUploadUrl = over.getUploadUrl ?? vi.fn(async () => ({ signedUrl: 'https://example/put', path: 'docs/aadhaar.jpg', bucket: 'driver-kyc', token: 'tok' }));
  const utils = render(
    <FileUpload
      label="Aadhaar — front"
      hint="JPG / PNG up to 5 MB"
      getUploadUrl={getUploadUrl}
      onUploaded={onUploaded}
      {...over}
    />,
  );
  return { onUploaded, getUploadUrl, ...utils };
}

describe('FileUpload', () => {
  it('renders the label, hint, and empty placeholder', () => {
    renderWith();
    expect(screen.getByText(/aadhaar — front/i)).toBeInTheDocument();
    expect(screen.getByText(/jpg \/ png up to 5 mb/i)).toBeInTheDocument();
    expect(screen.getByText(/tap to add a photo/i)).toBeInTheDocument();
  });

  it('shows a required asterisk when required is set', () => {
    renderWith({ required: true });
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('previews an existing remote image when value is provided', () => {
    renderWith({ value: 'https://cdn/x.jpg' });
    const img = screen.getByRole('img', { name: /aadhaar — front/i }) as HTMLImageElement;
    expect(img.src).toContain('https://cdn/x.jpg');
  });

  it('uploads a picked image — mints URL, calls uploadToSignedUrl, and reports the path', async () => {
    const { onUploaded, getUploadUrl } = renderWith();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'aadhaar.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('docs/aadhaar.jpg', expect.objectContaining({ signedUrl: 'https://example/put' })));
    expect(getUploadUrl).toHaveBeenCalled();
    expect(uploadToSignedUrl).toHaveBeenCalled();
  });

  it('surfaces an inline error message when the upload throws', async () => {
    vi.mocked(uploadToSignedUrl).mockRejectedValueOnce(new Error('Network down'));
    const { onUploaded } = renderWith();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'doc.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/network down/i)).toBeInTheDocument());
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('renders a PDF placeholder after uploading a PDF when allowPdf is on', async () => {
    const { } = renderWith({ allowPdf: true });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toContain('application/pdf');
    const file = new File(['%PDF'], 'rc.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/pdf uploaded/i)).toBeInTheDocument());
  });
});
