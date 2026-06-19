import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() body: { email?: string; password?: string; name?: string }) {
    const { email, password, name } = body ?? {};
    if (!email || !password || !name) {
      throw new BadRequestException('email, password e name sono obbligatori');
    }
    return this.auth.register(email, password, name);
  }

  @Post('login')
  login(@Body() body: { email?: string; password?: string }) {
    const { email, password } = body ?? {};
    if (!email || !password) {
      throw new BadRequestException('email e password sono obbligatori');
    }
    return this.auth.login(email, password);
  }
}
