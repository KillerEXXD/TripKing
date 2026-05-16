import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';

function withRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PageHeader', () => {
  it('renders the title as an <h1>', () => {
    withRouter(<PageHeader title="Vacant drivers" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Vacant drivers' })).toBeInTheDocument();
  });

  it('renders the subtitle when provided', () => {
    withRouter(<PageHeader title="X" subtitle="3 active" />);
    expect(screen.getByText('3 active')).toBeInTheDocument();
  });

  it('renders a back link when backTo is supplied; omits it otherwise', () => {
    const { rerender } = withRouter(<PageHeader title="X" backTo="/home" />);
    expect(screen.getByLabelText('Back')).toHaveAttribute('href', '/home');
    rerender(<MemoryRouter><PageHeader title="X" /></MemoryRouter>);
    expect(screen.queryByLabelText('Back')).not.toBeInTheDocument();
  });

  it('places the right slot at the end of the header', () => {
    withRouter(<PageHeader title="X" right={<button>Bell</button>} />);
    expect(screen.getByRole('button', { name: 'Bell' })).toBeInTheDocument();
  });
});
