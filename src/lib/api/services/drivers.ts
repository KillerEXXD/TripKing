import { mockDrivers } from '@/data/mockData';
import type { Driver } from '@/types';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function getDriver(id: string): Promise<Driver | null> {
  await sleep(80);
  return mockDrivers.find((d) => d.id === id) ?? null;
}

export async function listDrivers(): Promise<Driver[]> {
  await sleep(120);
  return mockDrivers;
}
