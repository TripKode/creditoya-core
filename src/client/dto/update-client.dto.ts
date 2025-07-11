import { User } from 'types/full';

export type UpdateClientDto = Omit<User, 'password'>;
