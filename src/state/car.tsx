import { createContext, useContext } from 'react';
import type { Car } from '../types';

const CarCtx = createContext<Car | null>(null);
export const ActiveCarProvider = CarCtx.Provider;

/** The car whose workspace the URL is showing. Provided by AppShell. */
export function useActiveCar(): Car {
  const c = useContext(CarCtx);
  if (!c) throw new Error('useActiveCar must be used inside AppShell');
  return c;
}
