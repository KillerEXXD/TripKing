import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FeedbackLandingPage } from '@/pages/administration/designs/feedback/FeedbackLandingPage';
import { clearFeedbackDraft } from '@/lib/designFeedback/draft';

function Wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FeedbackLandingPage', () => {
  beforeEach(() => clearFeedbackDraft());

  it('renders reviewer-name input + checklist of 16 sections (9 pages + 6 SUS + 1 cross-page)', () => {
    render(<Wrap><FeedbackLandingPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /collect design feedback/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/priya/i)).toBeInTheDocument();

    // 9 per-page links
    for (const label of ['Home (dashboard)', 'Trips list', 'Trip detail', 'Post trip (form)', 'My trips', 'Notifications', 'Referrals', 'Wallet', 'Scenarios (priority cards)']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // 6 SUS section links
    for (const v of ['v2 Operator Console', 'v3 Field Companion', 'v4 Pipeline Board', 'v5 Editorial', 'v6 Bharat-Native', 'v7 Simple Mode']) {
      expect(screen.getByText(v)).toBeInTheDocument();
    }
    // cross-page link
    expect(screen.getByText(/brand, trust, consistency/i)).toBeInTheDocument();

    // Submit button disabled until name + all sections done
    expect(screen.getByRole('button', { name: /submit feedback/i })).toBeDisabled();
  });
});

describe('AppRoutes registration for feedback', () => {
  it('declares all 5 feedback routes', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    const routesPath = path.resolve(dir, '../../../../../AppRoutes.tsx');
    const src = await fs.readFile(routesPath, 'utf8');
    // Routes are nested children of /app, so AppRoutes declares them WITHOUT a leading slash.
    for (const p of [
      'administration/designs/feedback',
      'administration/designs/feedback/page/:page',
      'administration/designs/feedback/sus/:design',
      'administration/designs/feedback/cross-page',
      'administration/designs/feedback/results',
    ]) {
      expect(src, `AppRoutes.tsx should register ${p} under /app/*`).toContain(`path="${p}"`);
    }
  });
});
