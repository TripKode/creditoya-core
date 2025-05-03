import { PartialType } from '@nestjs/mapped-types';
import { CreateLoanApplicationDto } from './create-loan.dto';

export class UpdateLoanApplicationDto extends PartialType(CreateLoanApplicationDto) {}