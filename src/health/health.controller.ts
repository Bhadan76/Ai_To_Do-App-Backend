import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check whether the API process is available' })
  @ApiResponse({
    status: 200,
    description: 'The API process is running.',
    schema: {
      example: {
        success: true,
        message: 'Daily Task API is running',
      },
    },
  })
  getHealth() {
    return {
      success: true,
      message: 'Daily Task API is running',
    };
  }
}
