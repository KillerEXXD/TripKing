import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { APPLICATION_FIXTURES } from '@/pages/v2/__fixtures__/applications';

vi.mock('@/hooks/useTrips', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useTrips')>('@/hooks/useTrips');
  return { ...actual, useMyApplications: vi.fn() };
});
import * as th from '@/hooks/useTrips';

import { OperatorMyTripsPage } from '@/pages/v2/operator-console/MyTripsPage';
import { FieldMyTripsPage } from '@/pages/v2/field-companion/MyTripsPage';
import { PipelineMyTripsPage } from '@/pages/v2/pipeline-board/MyTripsPage';
import { EditorialMyTripsPage } from '@/pages/v2/editorial/MyTripsPage';
import { BharatMyTripsPage } from '@/pages/v2/bharat-native/MyTripsPage';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function mockApps(items: typeof APPLICATION_FIXTURES) {
  vi.mocked(th.useMyApplications).mockReturnValue({
    data: items,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof th.useMyApplications>);
}

beforeEach(() => vi.clearAllMocks());

describe('v2 my-trips pages', () => {
  it('Operator: dense row per application with status pill', () => {
    mockApps(APPLICATION_FIXTURES);
    render(<Wrap><OperatorMyTripsPage /></Wrap>);
    expect(screen.getByText(/my applications/i)).toBeInTheDocument();
    expect(screen.getByText(/applied/i)).toBeInTheDocument();
    expect(screen.getByText(/selected/i)).toBeInTheDocument();
  });

  it('Field: hero card per application', () => {
    mockApps(APPLICATION_FIXTURES);
    render(<Wrap><FieldMyTripsPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /my trips/i })).toBeInTheDocument();
    expect(screen.getAllByText(/applied|selected|accepted/i).length).toBeGreaterThan(0);
  });

  it('Pipeline: applications grouped into status columns', () => {
    mockApps(APPLICATION_FIXTURES);
    render(<Wrap><PipelineMyTripsPage /></Wrap>);
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
  });

  it('Editorial: in-progress feature list', () => {
    mockApps(APPLICATION_FIXTURES);
    render(<Wrap><EditorialMyTripsPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /in progress/i })).toBeInTheDocument();
  });

  it('Bharat: bilingual list with vermilion fare', () => {
    mockApps(APPLICATION_FIXTURES);
    render(<Wrap><BharatMyTripsPage /></Wrap>);
    expect(screen.getByText(/என்னுடைய டிரிப்கள்/)).toBeInTheDocument();
  });
});
