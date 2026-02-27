import { IsString, Length, Matches } from 'class-validator';

export class RedeemDto {
  @IsString()
  @Length(5, 50)
  @Matches(/^TR-[A-Z0-9]{16}$/)
  code!: string;
}
