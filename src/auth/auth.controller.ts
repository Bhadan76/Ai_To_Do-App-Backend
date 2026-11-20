import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthSuccessEnvelopeDto, RefreshSuccessEnvelopeDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register an account and start a session' })
  @ApiCreatedResponse({
    type: AuthSuccessEnvelopeDto,
    description: 'Account created with safe user data and access/refresh tokens.',
  })
  @ApiBadRequestResponse({ description: 'The request DTO is invalid.' })
  @ApiConflictResponse({ description: 'An account with this email already exists.' })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in and issue access/refresh tokens' })
  @ApiOkResponse({
    type: AuthSuccessEnvelopeDto,
    description: 'Authenticated user and tokens.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new access token' })
  @ApiOkResponse({
    type: RefreshSuccessEnvelopeDto,
    description: 'Rotated refresh token and new access token.',
  })
  @ApiUnauthorizedResponse({
    description: 'The refresh token is invalid, expired, revoked, or reused.',
  })
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke the current refresh-token session',
    description:
      'Requires a valid access token. Only revokes a refresh-token family owned by that authenticated user.',
  })
  @ApiUnauthorizedResponse({
    description: 'A valid access token is required.',
  })
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RefreshTokenDto,
  ) {
    return this.authService.logout(body.refreshToken, user.id).then(() => ({
      message: 'Logged out successfully.',
    }));
  }
}
