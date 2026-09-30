import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @Matches(/^(\+62|62|0)8[1-9][0-9]{7,11}$/, {
    message: 'Nomor telepon tidak valid',
  })
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;
}
