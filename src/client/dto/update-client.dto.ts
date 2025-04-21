import { User } from 'types/full';
import { CreateClientDto } from './create-client.dto';

export type UpdateClientDto = Omit<User, 'password'>;
