import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueueListPage } from '@/components/queue/QueueListPage';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderQueue(props: Partial<Parameters<typeof QueueListPage>[0]> = {}) {
  const defaults = {
    title: 'My queue',
    items: [] as Array<{ id: string; label: string }>,
    getKey: (i: { id: string }) => i.id,
    renderItem: (i: { label: string }) => <span>{i.label}</span>,
    isPending: false,
    isError: false,
    emptyTitle: 'All caught up',
    emptyMessage: 'Nothing waiting on you.',
  };
  const final = { ...defaults, ...props } as Parameters<typeof QueueListPage>[0];
  return render(
    <MemoryRouter initialEntries={['/queue/test']}>
      <Routes>
        <Route
          path="/queue/test"
          element={
            <>
              <QueueListPage {...final} />
              <LocationProbe />
            </>
          }
        />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QueueListPage', () => {
  it('renders the loading skeleton while pending', () => {
    renderQueue({ isPending: true });
    expect(screen.queryByText('All caught up')).toBeNull();
  });

  it('renders an error state with retry when isError', () => {
    let retried = false;
    renderQueue({ isError: true, onRetry: () => { retried = true; } });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retried).toBe(true);
  });

  it('renders the empty state on initial-empty load without redirecting', () => {
    renderQueue({ items: [] });
    expect(screen.getByText('All caught up')).toBeInTheDocument();
    expect(screen.getByTestId('loc').textContent).toBe('/queue/test');
  });

  it('renders each item via renderItem and dedupes by getKey', () => {
    renderQueue({ items: [{ id: 'a', label: 'Trip A' }, { id: 'b', label: 'Trip B' }] });
    expect(screen.getByText('Trip A')).toBeInTheDocument();
    expect(screen.getByText('Trip B')).toBeInTheDocument();
  });

  it('back button navigates to backTo (default `/`)', () => {
    renderQueue({ items: [{ id: 'a', label: 'Trip A' }] });
    fireEvent.click(screen.getByRole('button', { name: /back to home/i }));
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('auto-bounces home when the queue transitions from N>0 to 0', () => {
    function Harness() {
      const [items, setItems] = useState<Array<{ id: string; label: string }>>([{ id: 'a', label: 'A' }]);
      return (
        <>
          <button type="button" onClick={() => setItems([])}>clear queue</button>
          <QueueListPage
            title="Q"
            items={items}
            getKey={(i: { id: string }) => i.id}
            renderItem={(i: { label: string }) => <span>{i.label}</span>}
            isPending={false}
            isError={false}
            emptyTitle="Done"
          />
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={['/queue/test']}>
        <Routes>
          <Route path="/queue/test" element={<Harness />} />
          <Route path="/" element={<div>home page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear queue/i }));
    expect(screen.getByText('home page')).toBeInTheDocument();
  });
});
