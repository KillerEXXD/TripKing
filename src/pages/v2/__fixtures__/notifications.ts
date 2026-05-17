import type { Notification } from '@/types';

export const NOTIFICATION_FIXTURES: Notification[] = [
  {
    id: 'n1',
    userId: 'u1',
    type: 'alert_match',
    title: 'New trip matches your alert',
    body: 'Vellore → Chennai · ₹4,200 payout',
    payloadJson: {},
    isRead: false,
    createdAt: '2026-05-17T10:00:00Z',
  },
  {
    id: 'n2',
    userId: 'u1',
    type: 'trip_assigned',
    title: 'You were selected',
    body: 'Bangalore → Tirupati starts at 6:00 PM',
    payloadJson: {},
    isRead: false,
    createdAt: '2026-05-17T09:30:00Z',
  },
  {
    id: 'n3',
    userId: 'u1',
    type: 'review_received',
    title: 'New 5-star review',
    body: '"Polite, on time, clean car." — Anand',
    payloadJson: {},
    isRead: true,
    createdAt: '2026-05-16T19:15:00Z',
  },
];
