/**
 * Mock KYC subjects for the Admin → KYC Queue + Review pages.
 *
 * In production this is sourced from `drivers` / `trip_managers` tables
 * filtered to KYC statuses needing admin attention. For the prototype we
 * keep a richer fixture here so the review screen can demonstrate the
 * full document set + pending-checks UX.
 */

import type { KycStatus, UserRole } from '@/types';

export interface KycCheck {
  key: string;
  label: string;
  done: boolean;
  /** Optional short hint shown when not done. */
  hint?: string;
}

export interface KycSubject {
  id: string;
  name: string;
  role: Exclude<UserRole, 'admin'>;
  phone: string;
  email?: string;
  homeCity: string;
  status: KycStatus;
  submittedAtIso: string;
  /** Quick relative-time label for the queue list. */
  ageLabel: string;

  aadhaarMasked: string;
  voterIdMasked: string;
  licenseNumber?: string;
  licenseExpiry?: string;

  /** Free-form scheduled video call (ISO). Null if not scheduled yet. */
  videoCallAtIso?: string;
  videoCallProvider?: 'daily' | 'jitsi' | 'google_meet';

  /** Vehicle (drivers only) */
  vehicle?: {
    make: string;
    model: string;
    year: number;
    registration: string;
    carType: string;
    seats: number;
    ac: boolean;
    fuelType: string;
    insuranceExpiry: string;
    permitUploaded: boolean;
  };

  /** Optional admin notes / rejection reason. */
  adminNote?: string;

  /** Auto-derived in the page; left here for explicit demo. */
  pendingChecks: KycCheck[];
}

export const mockKycSubjects: KycSubject[] = [
  {
    id: 'kyc-suresh',
    name: 'Suresh Kumar',
    role: 'driver',
    phone: '+919876543220',
    email: 'suresh.k@example.in',
    homeCity: 'Madurai',
    status: 'docs_submitted',
    submittedAtIso: new Date(Date.now() - 2 * 3600_000).toISOString(),
    ageLabel: '2h ago',
    aadhaarMasked: '**** **** 4421',
    voterIdMasked: '**** 8845',
    licenseNumber: 'TN-21-2019-0098441',
    licenseExpiry: '2031-04-12',
    vehicle: {
      make: 'Maruti',
      model: 'Ertiga',
      year: 2021,
      registration: 'TN 21 BR 8842',
      carType: 'Sedan',
      seats: 7,
      ac: true,
      fuelType: 'Diesel',
      insuranceExpiry: '2026-09-15',
      permitUploaded: true,
    },
    pendingChecks: [
      { key: 'review-aadhaar', label: 'Review Aadhaar (front + back)', done: false },
      { key: 'review-voter', label: 'Review Voter ID', done: false },
      { key: 'review-license', label: 'Review Driver License + verify expiry > 1y', done: false },
      { key: 'review-vehicle', label: 'Confirm 4-side vehicle photos + RC', done: false },
      { key: 'schedule-video', label: 'Schedule video-call verification', done: false },
    ],
  },
  {
    id: 'kyc-priya',
    name: 'Priya Devi',
    role: 'driver',
    phone: '+919876543221',
    email: 'priya.devi@example.in',
    homeCity: 'Coimbatore',
    status: 'video_pending',
    submittedAtIso: new Date(Date.now() - 5 * 3600_000).toISOString(),
    ageLabel: '5h ago',
    aadhaarMasked: '**** **** 9912',
    voterIdMasked: '**** 3320',
    licenseNumber: 'TN-22-2020-0011225',
    licenseExpiry: '2032-07-08',
    videoCallAtIso: new Date(Date.now() + 25 * 60_000).toISOString(),
    videoCallProvider: 'daily',
    vehicle: {
      make: 'Hyundai',
      model: 'Aura',
      year: 2022,
      registration: 'TN 38 BV 0011',
      carType: 'Sedan',
      seats: 4,
      ac: true,
      fuelType: 'Petrol',
      insuranceExpiry: '2026-11-30',
      permitUploaded: true,
    },
    pendingChecks: [
      { key: 'review-aadhaar', label: 'Review Aadhaar (front + back)', done: true },
      { key: 'review-voter', label: 'Review Voter ID', done: true },
      { key: 'review-license', label: 'Review Driver License + verify expiry > 1y', done: true },
      { key: 'review-vehicle', label: 'Confirm 4-side vehicle photos + RC', done: true },
      {
        key: 'video-call',
        label: 'Conduct video-call verification',
        done: false,
        hint: 'Scheduled · starts in 25 min',
      },
      { key: 'final-decision', label: 'Approve / reject after video call', done: false },
    ],
  },
  {
    id: 'kyc-vikram',
    name: 'Vikram Reddy',
    role: 'trip_manager',
    phone: '+919876500220',
    email: 'vikram@arasutravels.in',
    homeCity: 'Chennai',
    status: 'video_pending',
    submittedAtIso: new Date(Date.now() - 24 * 3600_000).toISOString(),
    ageLabel: '1 day ago',
    aadhaarMasked: '**** **** 5567',
    voterIdMasked: '**** 1199',
    videoCallAtIso: new Date(Date.now() + 2 * 3600_000).toISOString(),
    videoCallProvider: 'daily',
    pendingChecks: [
      { key: 'review-aadhaar', label: 'Review Aadhaar (front + back)', done: true },
      { key: 'review-voter', label: 'Review Voter ID', done: true },
      { key: 'review-business', label: 'Confirm business name & city', done: true },
      {
        key: 'video-call',
        label: 'Conduct video-call verification',
        done: false,
        hint: 'Scheduled · starts in 2h',
      },
      { key: 'final-decision', label: 'Approve / reject after video call', done: false },
    ],
  },
  {
    id: 'kyc-murugan',
    name: 'Murugan Sivam',
    role: 'driver',
    phone: '+919876543212',
    email: 'murugan.s@example.in',
    homeCity: 'Vellore',
    status: 'resubmit_required',
    submittedAtIso: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
    ageLabel: '2 days ago',
    aadhaarMasked: '**** **** 7723',
    voterIdMasked: '**** 6643',
    licenseNumber: 'TN-23-2021-0017845',
    licenseExpiry: '2031-12-22',
    adminNote: 'Front photo of Aadhaar is blurred — please re-upload.',
    vehicle: {
      make: 'Hyundai',
      model: 'Aura',
      year: 2021,
      registration: 'TN 23 AD 9012',
      carType: 'Sedan',
      seats: 4,
      ac: true,
      fuelType: 'Petrol',
      insuranceExpiry: '2026-08-22',
      permitUploaded: false,
    },
    pendingChecks: [
      { key: 'aadhaar-resub', label: 'Re-upload Aadhaar front (blurred)', done: false, hint: 'Blocking — pending applicant action' },
      { key: 'permit-upload', label: 'Upload commercial permit', done: false },
      { key: 'review-aadhaar', label: 'Re-review Aadhaar after resubmission', done: false },
      { key: 'schedule-video', label: 'Schedule video-call verification', done: false },
    ],
  },
];
