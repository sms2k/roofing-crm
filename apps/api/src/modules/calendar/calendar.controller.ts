import { Controller, Post, Get, Delete, Query, Param, Req } from '@nestjs/common';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('auth/google')
  getGoogleAuthUrl(@Req() req: any) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.query.userId;
    return { authUrl: this.calendarService.getGoogleAuthUrl(tenantId, userId) };
  }

  @Get('auth/outlook')
  getOutlookAuthUrl(@Req() req: any) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.query.userId;
    return { authUrl: this.calendarService.getOutlookAuthUrl(tenantId, userId) };
  }

  @Post('auth/google/callback')
  async handleGoogleCallback(@Req() req: any, @Query('code') code: string, @Query('state') state: string) {
    const { tenantId, userId } = JSON.parse(state);
    return this.calendarService.handleGoogleCallback(code, tenantId, userId);
  }

  @Post('auth/outlook/callback')
  async handleOutlookCallback(@Req() req: any, @Query('code') code: string, @Query('state') state: string) {
    const { tenantId, userId } = JSON.parse(state);
    return this.calendarService.handleOutlookCallback(code, tenantId, userId);
  }

  @Delete('disconnect/:provider')
  async disconnect(@Req() req: any, @Param('provider') provider: 'GOOGLE' | 'OUTLOOK') {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;
    return this.calendarService.disconnectCalendar(tenantId, userId, provider);
  }

  @Post('sync/:provider/to-calendar')
  async syncToCalendar(@Req() req: any, @Param('provider') provider: 'GOOGLE' | 'OUTLOOK') {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;
    return this.calendarService.syncToCalendar(tenantId, userId, provider);
  }

  @Post('sync/:provider/from-calendar')
  async syncFromCalendar(@Req() req: any, @Param('provider') provider: 'GOOGLE' | 'OUTLOOK') {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;
    return this.calendarService.syncFromCalendar(tenantId, userId, provider);
  }

  @Post('sync/:provider/both-ways')
  async syncBothWays(@Req() req: any, @Param('provider') provider: 'GOOGLE' | 'OUTLOOK') {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;
    return this.calendarService.syncBothWays(tenantId, userId, provider);
  }

  @Get('connected')
  async getConnectedCalendars(@Req() req: any) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.query.userId;
    return this.calendarService.getConnectedCalendars(tenantId, userId);
  }
}
