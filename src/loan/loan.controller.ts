// src/modules/loan/controllers/loan.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { LoanService } from './loan.service';
import { CreateLoanApplicationDto } from './dto/create-loan.dto';
import { UpdateLoanApplicationDto } from './dto/update-loan.dto';
import { ChangeLoanStatusDto } from './dto/change-loan-status.dto';
import { StatusLoan } from '@prisma/client';

@Controller('loans')
export class LoanController {
  constructor(private readonly loanService: LoanService) { }

  @Post()
  async create(@Body() createLoanDto: CreateLoanApplicationDto) {
    return this.loanService.create(createLoanDto);
  }

  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
    @Query('searchTerm') searchTerm?: string,
    @Query('orderBy', new DefaultValuePipe('asc')) orderBy?: 'asc' | 'desc',
    @Query('filterByAmount', new DefaultValuePipe(false), ParseBoolPipe) filterByAmount?: boolean,
  ) {
    if (orderBy !== 'asc' && orderBy !== 'desc') {
      throw new BadRequestException('orderBy debe ser "asc" o "desc"');
    }

    return this.loanService.getAll(page, pageSize, searchTerm, orderBy, filterByAmount);
  }

  @Get('pending')
  async getPendingLoans(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
  ) {
    return this.loanService.getPendingLoans(page, pageSize);
  }

  @Get('approved')
  async getApprovedLoans(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
    @Query('search') searchQuery?: string,
  ) {
    return this.loanService.getApprovedLoans(page, pageSize, searchQuery);
  }

  @Get('deferred')
  async getDeferredLoans(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
    @Query('search') searchQuery?: string,
  ) {
    return this.loanService.getDeferredLoans(page, pageSize, searchQuery);
  }

  @Get('new-cantity')
  async getLoansWithDefinedNewCantity(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
    @Query('search') searchQuery?: string,
  ) {
    return this.loanService.getLoansWithDefinedNewCantity(page, pageSize, searchQuery);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loanService.get(id);
  }

  @Get('user/:userId')
  async findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.loanService.getAllByUserId(userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateLoanDto: UpdateLoanApplicationDto,
  ) {
    return this.loanService.update(id, updateLoanDto);
  }

  @Patch(':id/status')
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changeStatusDto: ChangeLoanStatusDto,
  ) {
    return this.loanService.changeStatus(id, changeStatusDto);
  }

  @Patch(':id/reject')
  async changeReject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    return this.loanService.changeReject(id, reason);
  }

  @Patch(':id/employee/:employeeId')
  async fillEmployeeId(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.loanService.fillEmployeeId(id, employeeId);
  }

  @Patch(':id/cantity')
  async changeCantity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('newCantity') newCantity: string,
    @Body('reasonChangeCantity') reasonChangeCantity: string,
    @Body('employeeId') employeeId: string,
  ) {
    return this.loanService.changeCantity(id, newCantity, reasonChangeCantity, employeeId);
  }

  @Patch(':id/respond-cantity')
  async respondToNewCantity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('accept', ParseBoolPipe) accept: boolean,
    @Body('status') status: StatusLoan,
  ) {
    return this.loanService.respondToNewCantity(id, accept, status);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.loanService.delete(id);
  }
}