import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WebsitePage } from '@/pages/WebsitePage';
import { ForAgentsPage } from '@/pages/ForAgentsPage';

// Smoke tests — these are ported, data-free marketing pages; assert they render
// without crashing and produce substantial content.
describe('marketing pages render', () => {
  it('/website (WebsitePage)', () => {
    const { container } = render(
      <MemoryRouter>
        <WebsitePage />
      </MemoryRouter>,
    );
    expect((container.textContent ?? '').length).toBeGreaterThan(200);
  });

  it('/for-agents (ForAgentsPage)', () => {
    const { container } = render(
      <MemoryRouter>
        <ForAgentsPage />
      </MemoryRouter>,
    );
    expect((container.textContent ?? '').length).toBeGreaterThan(200);
  });
});
