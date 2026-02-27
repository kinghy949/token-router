import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRedeemCodesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tokenAmount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
