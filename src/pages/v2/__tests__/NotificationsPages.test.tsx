import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NOTIFICATION_FIXTURES } from '@/pages/v2/__fixtures__/notifications';

vi.mock('@/hooks/useNotifications');
import * as nh from '@/hooks/useNotifications';

import { OperatorNotificationsPage } from '@/pages/v2/operator-console/NotificationsPage';
import { FieldNotificationsPage } from '@/pages/v2/field-companion/NotificationsPage';
import { PipelineNotificationsPage } from '@/pages/v2/pipeline-board/NotificationsPage';
import { EditorialNotificationsPage } from '@/pages/v2/editorial/NotificationsPage';
import { BharatNotificationsPage } from '@/pages/v2/bharat-native/NotificationsPage';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function mockNotifications(items: typeof NOTIFICATION_FIXTURES) {
  vi.mocked(nh.useNotifications).mockReturnValue({
    data: items,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof nh.useNotifications>);
}

beforeEach(() => vi.clearAllMocks());

describe('v2 notifications pages', () => {
  it('Operator: renders type pills + unread count', () => {
    mockNotifications(NOTIFICATION_FIXTURES);
    render(<Wrap><OperatorNotificationsPage /></Wrap>);
    expect(screen.getByText('2 unread')).toBeInTheDocument();
    expect(screen.getByText(/new trip matches/i)).toBeInTheDocument();
  });

  it('Field: renders icon cards', () => {
    mockNotifications(NOTIFICATION_FIXTURES);
    render(<Wrap><FieldNotificationsPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByText(/new trip matches/i)).toBeInTheDocument();
  });

  it('Pipeline: splits unread vs read into columns', () => {
    mockNotifications(NOTIFICATION_FIXTURES);
    render(<Wrap><PipelineNotificationsPage /></Wrap>);
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('Editorial: renders dispatches list with type kicker', () => {
    mockNotifications(NOTIFICATION_FIXTURES);
    render(<Wrap><EditorialNotificationsPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /dispatches/i })).toBeInTheDocument();
    expect(screen.getByText(/alert match/i)).toBeInTheDocument();
  });

  it('Bharat: bilingual header + items', () => {
    mockNotifications(NOTIFICATION_FIXTURES);
    render(<Wrap><BharatNotificationsPage /></Wrap>);
    expect(screen.getByText(/அறிவிப்புகள்/)).toBeInTheDocument();
    expect(screen.getByText(/new trip matches/i)).toBeInTheDocument();
  });
});
