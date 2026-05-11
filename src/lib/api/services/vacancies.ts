import { mockVacancies, mockDrivers } from '@/data/mockData';
import type { Driver, Vehicle, VacancyPost } from '@/types';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export interface VacancyWithDriver extends VacancyPost {
  driver: Pick<
    Driver,
    | 'id'
    | 'fullName'
    | 'profilePhotoUrl'
    | 'ratingAvg'
    | 'ratingCount'
    | 'totalTripsCompleted'
    | 'topTags'
  >;
  vehicle: Pick<
    Vehicle,
    'id' | 'make' | 'model' | 'year' | 'carType' | 'seats' | 'ac' | 'fuelType'
  >;
}

export async function listMyVacancies(_driverId: string): Promise<VacancyPost[]> {
  await sleep(80);
  return mockVacancies;
}

/**
 * List active vacancies, joined with driver + vehicle metadata so the consumer
 * (Vacancies feed) can render rich cards in one pass — no N+1 fetches.
 *
 * In production this maps to a dedicated edge function that does the join
 * server-side, since `vacancy_posts` only stores FKs.
 */
export async function listActiveVacancies(): Promise<VacancyWithDriver[]> {
  await sleep(120);
  const now = Date.now();
  return mockVacancies
    .filter((v) => v.status === 'active' && new Date(v.availableUntil ?? 0).getTime() > now)
    .map((v) => {
      const driver = mockDrivers.find((d) => d.id === v.driverId);
      const vehicle = driver?.vehicles.find((vh) => vh.id === v.vehicleId);
      if (!driver || !vehicle) return null;
      return {
        ...v,
        driver: {
          id: driver.id,
          fullName: driver.fullName,
          profilePhotoUrl: driver.profilePhotoUrl,
          ratingAvg: driver.ratingAvg,
          ratingCount: driver.ratingCount,
          totalTripsCompleted: driver.totalTripsCompleted,
          topTags: driver.topTags,
        },
        vehicle: {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          carType: vehicle.carType,
          seats: vehicle.seats,
          ac: vehicle.ac,
          fuelType: vehicle.fuelType,
        },
      } as VacancyWithDriver;
    })
    .filter((v): v is VacancyWithDriver => v !== null);
}

export async function postVacancy(
  vacancy: Omit<VacancyPost, 'id' | 'status'>,
): Promise<VacancyPost> {
  await sleep(200);
  return { ...vacancy, id: `vac-${Date.now()}`, status: 'active' };
}
