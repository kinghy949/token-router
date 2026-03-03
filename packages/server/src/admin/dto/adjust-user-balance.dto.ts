import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, NotEquals } from 'class-validator';

export class AdjustUserBalanceDto {
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
