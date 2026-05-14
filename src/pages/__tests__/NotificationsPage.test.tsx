import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { NotificationsPage } from '@/pages/NotificationsPage';
import type { Notification } from '@/types';

vi.mock('@/hooks/useNotifications', () => ({ useNotifications: vi.fn(), useMarkNotificationRead: vi.fn(), useMarkAllNotificationsRead: vi.fn() }));
vi.mock('@/hooks/useVacancyInvitations', () => ({ useDecideVacancyInvitation: () => ({ mutate: vi.fn(), isPending: false }) }));
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/useNotifications';

function makeNotif(over: Partial<Notification> = {}): Notification {
  return { id: 'n1', userId: 'u1', type: 'trip_assigned', title: 'You were assigned a trip', body: 'Vellore → Chennai', payloadJson: { trip_id: 't9' }, isRead: false, createdAt: new Date().toISOString(), ...over };
}

type NotifState = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; data?: Notification[]; refetch?: () => void };
function setNotifs(state: NotifState) {
  vi.mocked(useNotifications).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...state } as never);
}
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

describe('back button', () => {
  beforeEach(() => navigateSpy.mockReset());

  function mountWithMutations() {
    setNotifs({ data: [] });
    vi.mocked(useMarkNotificationRead).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(useMarkAllNotificationsRead).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
  }

  it('renders a Back button at the top of the page', () => {
    mountWithMutations();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('navigates back one entry when history is non-empty', () => {
    Object.defineProperty(window.history, 'length', { configurable: true, value: 5 });
    mountWithMutations();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(navigateSpy).toHaveBeenCalledWith(-1);
  });

  it('falls back to / when the history stack is empty', () => {
    Object.defineProperty(window.history, 'length', { configurable: true, value: 1 });
    mountWithMutations();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });
});

function setMutations() {
  const markReadMut = { mutate: vi.fn(), isPending: false };
  const markAllMut = { mutate: vi.fn(), isPending: false };
  vi.mocked(useMarkNotificationRead).mockReturnValue(markReadMut as never);
  vi.mocked(useMarkAllNotificationsRead).mockReturnValue(markAllMut as never);
  return { markReadMut, markAllMut };
}

function renderNotifs() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.mocked(useNotifications).mockReset();
    vi.mocked(useMarkNotificationRead).mockReset();
    vi.mocked(useMarkAllNotificationsRead).mockReset();
    setMutations();
  });

  it('renders a skeleton while loading', () => {
    setNotifs({ isPending: true, isSuccess: false });
    renderNotifs();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry on failure', () => {
    const refetch = vi.fn();
    setNotifs({ isError: true, isSuccess: false, refetch });
    renderNotifs();
    expect(screen.getByText(/couldn't load notifications/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders an empty state when there are no notifications', () => {
    setNotifs({ data: [] });
    renderNotifs();
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
  });

  it('lists notifications and disables "Mark all read" when nothing is unread', () => {
    setNotifs({ data: [makeNotif({ id: 'n1', title: 'You were assigned a trip', isRead: true }), makeNotif({ id: 'n2', title: 'Trip completed', type: 'trip_completed', isRead: true })] });
    renderNotifs();
    expect(screen.getByText('You were assigned a trip')).toBeInTheDocument();
    expect(screen.getByText('Trip completed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeDisabled();
  });

  it('"Mark all read" marks everything when there is unread', () => {
    const { markAllMut } = setMutations();
    setNotifs({ data: [makeNotif({ isRead: false })] });
    renderNotifs();
    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(markAllMut.mutate).toHaveBeenCalled();
  });

  it('"Mark read" on an unread notification marks just that one', () => {
    const { markReadMut } = setMutations();
    setNotifs({ data: [makeNotif({ id: 'n7', isRead: false })] });
    renderNotifs();
    fireEvent.click(screen.getByRole('button', { name: /^mark read$/i }));
    expect(markReadMut.mutate).toHaveBeenCalledWith('n7');
  });

  it('a11y: list of notifications has no axe violations', async () => {
    setNotifs({ data: [makeNotif({ id: 'n1', isRead: false }), makeNotif({ id: 'n2', title: 'Trip completed', type: 'trip_completed', isRead: true })] });
    const { container } = renderNotifs();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a11y: empty state has no axe violations', async () => {
    setNotifs({ data: [] });
    const { container } = renderNotifs();
    expect(await axe(container)).toHaveNoViolations();
  });
});
