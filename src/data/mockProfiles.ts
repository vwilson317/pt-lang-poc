import { Profile } from '../types/profile';

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addHours(d: Date, h: number): Date {
  const out = new Date(d);
  out.setHours(out.getHours() + h);
  return out;
}

const now = new Date();

export const MOCK_MEN: Profile[] = [
  {
    id: 'm1',
    name: 'Rafael',
    age: 28,
    imageUri: 'https://picsum.photos/seed/m1/400/600',
    countryCode: 'BR',
    currentLocation: 'Rio de Janeiro',
    leavingAt: addDays(now, 5),
    gender: 'male',
  },
  {
    id: 'm2',
    name: 'Bruno',
    age: 32,
    imageUri: 'https://picsum.photos/seed/m2/400/600',
    countryCode: 'PT',
    currentLocation: 'Salvador',
    leavingAt: addHours(now, 18),
    gender: 'male',
  },
  {
    id: 'm3',
    name: 'Lucas',
    age: 25,
    imageUri: 'https://picsum.photos/seed/m3/400/600',
    countryCode: 'AR',
    currentLocation: 'São Paulo',
    leavingAt: addDays(now, 2),
    gender: 'male',
  },
  {
    id: 'm4',
    name: 'Diego',
    age: 30,
    imageUri: 'https://picsum.photos/seed/m4/400/600',
    countryCode: 'CO',
    currentLocation: 'Rio de Janeiro',
    leavingAt: addDays(now, 1),
    gender: 'male',
  },
  {
    id: 'm5',
    name: 'Thiago',
    age: 27,
    imageUri: 'https://picsum.photos/seed/m5/400/600',
    countryCode: 'BR',
    currentLocation: 'Florianópolis',
    leavingAt: addHours(now, 48),
    gender: 'male',
  },
];

export const MOCK_WOMEN: Profile[] = [
  {
    id: 'w1',
    name: 'Beatriz',
    age: 26,
    imageUri: 'https://picsum.photos/seed/w1/400/600',
    countryCode: 'BR',
    currentLocation: 'Rio de Janeiro',
    leavingAt: addDays(now, 4),
    gender: 'female',
  },
  {
    id: 'w2',
    name: 'Marina',
    age: 29,
    imageUri: 'https://picsum.photos/seed/w2/400/600',
    countryCode: 'ES',
    currentLocation: 'Salvador',
    leavingAt: addHours(now, 12),
    gender: 'female',
  },
  {
    id: 'w3',
    name: 'Camila',
    age: 24,
    imageUri: 'https://picsum.photos/seed/w3/400/600',
    countryCode: 'BR',
    currentLocation: 'São Paulo',
    leavingAt: addDays(now, 3),
    gender: 'female',
  },
  {
    id: 'w4',
    name: 'Larissa',
    age: 31,
    imageUri: 'https://picsum.photos/seed/w4/400/600',
    countryCode: 'UY',
    currentLocation: 'Rio de Janeiro',
    leavingAt: addDays(now, 7),
    gender: 'female',
  },
  {
    id: 'w5',
    name: 'Fernanda',
    age: 27,
    imageUri: 'https://picsum.photos/seed/w5/400/600',
    countryCode: 'BR',
    currentLocation: 'Florianópolis',
    leavingAt: addHours(now, 36),
    gender: 'female',
  },
];

export const MOCK_PROFILES = [...MOCK_MEN, ...MOCK_WOMEN];
