import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import {
  UserMessageEnvelopeDto,
  UserProfileEnvelopeDto,
} from './dto/user-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({ type: UserProfileEnvelopeDto })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  @ApiNotFoundResponse({ description: 'The authenticated user was not found.' })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiOkResponse({ type: UserProfileEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The profile update is invalid.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, body);
  }

  @Patch('password')
  @ApiOperation({
    summary: 'Change the authenticated user password',
    description:
      'All active refresh-token sessions are revoked. Previously issued access tokens remain valid until their configured expiration.',
  })
  @ApiOkResponse({ type: UserMessageEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The password request is invalid.' })
  @ApiUnauthorizedResponse({
    description: 'The current password is incorrect or authentication is invalid.',
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(user.id, body);
    return { message: 'Password changed successfully.' };
  }

  @Delete()
  @ApiOperation({
    summary: 'Delete the authenticated user account',
    description:
      'Permanently deletes the account and related data using database cascades. Requires the current password and DELETE confirmation.',
  })
  @ApiOkResponse({ type: UserMessageEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The deletion confirmation is invalid.' })
  @ApiUnauthorizedResponse({
    description: 'The current password is incorrect or authentication is invalid.',
  })
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: DeleteAccountDto,
  ) {
    await this.usersService.deleteAccount(user.id, body);
    return { message: 'Account deleted successfully.' };
  }
}
