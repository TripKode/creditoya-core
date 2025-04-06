import { PartialType } from '@nestjs/mapped-types';
import { CreateClientDto } from './create-client.dto';

export type UpdateClientDto = Omit<CreateClientDto, 'password'>;
