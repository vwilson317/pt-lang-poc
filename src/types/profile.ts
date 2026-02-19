export type Gender = 'male' | 'female';

export interface Profile {
  id: string;
  name: string;
  age: number;
  imageUri: string;
  countryCode: string; // e.g. "BR", "US" for flag emoji
  currentLocation: string;
  leavingAt: Date; // when they're leaving the location
  gender: Gender;
}

export interface SwipeDirection {
  x: number;
  y: number;
}
