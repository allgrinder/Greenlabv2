import { customAlphabet } from 'nanoid';

const gen = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

export const newId = (): string => gen();
