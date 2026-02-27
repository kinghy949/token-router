import { IsOptional, IsString, MaxLength } from 'class-validator';
import { GetTransactionsDto } from './get-transactions.dto';

export class GetUsageDto extends GetTransactionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
