import type { Opening } from '../model/types';

export function openingArea(o: Opening): number {
  return (o.width / 1000) * (o.height / 1000);
}
