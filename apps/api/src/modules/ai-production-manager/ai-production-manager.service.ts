import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OllamaService } from '../ai/ollama.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface WeatherForecast {
  date: Date;
  temperature: number; // Fahrenheit
  precipitation: number; // percentage
  windSpeed: number; // mph
  conditions: string;
  suitable: boolean;
  warnings: string[];
}

interface CrewMember {
  id: string;
  name: string;
  role: string;
  skills: string[];
  availability: Date[];
  currentLoad: number; // number of active jobs
  performance: number; // 0-100
}

interface SchedulingRecommendation {
  jobId: string;
  recommendedDate: Date;
  recommendedCrew: CrewMember[];
  confidence: number; // 0-100
  reasoning: string[];
  alternatives: {
    date: Date;
    crew: CrewMember[];
    score: number;
  }[];
  estimatedDuration: number; // hours
  weatherRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface JobDurationPrediction {
  jobId: string;
  estimatedDuration: number; // hours
  confidence: number; // 0-100
  factors: {
    name: string;
    impact: number; // hours
    reason: string;
  }[];
  historicalComparison: {
    similar: number;
    averageDuration: number;
    range: { min: number; max: number };
  };
}

interface CrewOptimization {
  date: Date;
  crews: {
    members: CrewMember[];
    jobs: any[];
    totalHours: number;
    utilization: number; // percentage
    conflicts: string[];
  }[];
  recommendations: string[];
  efficiency: number; // 0-100
}

interface RescheduleAlert {
  jobId: string;
  currentDate: Date;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  suggestedNewDate: Date;
  autoReschedule: boolean;
}

@Injectable()
export class AiProductionManagerService {
  private readonly logger = new Logger(AiProductionManagerService.name);
  private readonly weatherApiKey = process.env.WEATHER_API_KEY || '';
  private readonly weatherBaseUrl = 'https://api.weatherapi.com/v1';

  constructor(
    private readonly db: DatabaseService,
    private readonly ollama: OllamaService,
    private readonly http: HttpService,
  ) {}

  /**
   * Get weather forecast for a location
   */
  async getWeatherForecast(
    latitude: number,
    longitude: number,
    days: number = 7,
  ): Promise<WeatherForecast[]> {
    this.logger.log(`Getting ${days}-day weather forecast for ${latitude}, ${longitude}`);

    if (!this.weatherApiKey) {
      this.logger.warn('Weather API key not configured, using mock data');
      return this.getMockWeatherForecast(days);
    }

    try {
      const url = `${this.weatherBaseUrl}/forecast.json?key=${this.weatherApiKey}&q=${latitude},${longitude}&days=${days}`;
      const response = await firstValueFrom(this.http.get(url));
      const data = response.data as any;

      return data.forecast.forecastday.map((day: any) => {
        const precipitation = day.day.daily_chance_of_rain;
        const windSpeed = day.day.maxwind_mph;
        const conditions = day.day.condition.text;

        // Roofing suitability rules
        const suitable =
          precipitation < 30 && // Less than 30% chance of rain
          windSpeed < 20 && // Wind less than 20 mph
          !conditions.toLowerCase().includes('storm') &&
          !conditions.toLowerCase().includes('thunder');

        const warnings = [];
        if (precipitation >= 30) warnings.push('High chance of precipitation');
        if (windSpeed >= 20) warnings.push('Strong winds expected');
        if (conditions.toLowerCase().includes('storm')) warnings.push('Storm conditions');

        return {
          date: new Date(day.date),
          temperature: day.day.avgtemp_f,
          precipitation,
          windSpeed,
          conditions,
          suitable,
          warnings,
        };
      });
    } catch (error) {
      this.logger.error(`Failed to fetch weather: ${error.message}`);
      return this.getMockWeatherForecast(days);
    }
  }

  /**
   * Mock weather forecast for testing
   */
  private getMockWeatherForecast(days: number): WeatherForecast[] {
    const forecasts: WeatherForecast[] = [];
    const baseDate = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);

      // Randomize weather for mock data
      const precipitation = Math.random() * 100;
      const windSpeed = Math.random() * 30;
      const temperature = 65 + Math.random() * 20;

      const suitable = precipitation < 30 && windSpeed < 20;

      const warnings = [];
      if (precipitation >= 30) warnings.push('Possible rain');
      if (windSpeed >= 20) warnings.push('Windy conditions');

      forecasts.push({
        date,
        temperature,
        precipitation,
        windSpeed,
        conditions: precipitation > 50 ? 'Rainy' : 'Partly cloudy',
        suitable,
        warnings,
      });
    }

    return forecasts;
  }

  /**
   * Predict job duration based on historical data and AI
   */
  async predictJobDuration(tenantId: string, jobId: string): Promise<JobDurationPrediction> {
    this.logger.log(`Predicting duration for job ${jobId}`);

    const job = await this.db.job.findFirst({
      where: { id: jobId, tenantId },
      include: {
        property: true,
        lead: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Get historical similar jobs
    const similarJobs = await this.db.job.findMany({
      where: {
        tenantId,
        status: 'COMPLETED',
        jobType: job.jobType,
        NOT: { completedAt: null, startedAt: null },
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
    });

    // Calculate durations of similar jobs
    const historicalDurations = similarJobs.map((j) => {
      if (!j.startedAt || !j.completedAt) return 0;
      return (j.completedAt.getTime() - j.startedAt.getTime()) / (1000 * 60 * 60); // hours
    }).filter((d) => d > 0);

    const averageDuration =
      historicalDurations.length > 0
        ? historicalDurations.reduce((a, b) => a + b, 0) / historicalDurations.length
        : 8; // Default 8 hours

    const minDuration = historicalDurations.length > 0 ? Math.min(...historicalDurations) : 6;
    const maxDuration = historicalDurations.length > 0 ? Math.max(...historicalDurations) : 12;

    // Base estimate on historical average
    let estimatedDuration = averageDuration;
    const factors: { name: string; impact: number; reason: string }[] = [];

    // Factor 1: Property size
    if (job.property) {
      const squareFeet = job.property.squareFeet || 0;
      if (squareFeet > 3000) {
        factors.push({
          name: 'Large Property',
          impact: 4,
          reason: 'Property is over 3000 sq ft',
        });
        estimatedDuration += 4;
      } else if (squareFeet > 2000) {
        factors.push({
          name: 'Medium Property',
          impact: 2,
          reason: 'Property is 2000-3000 sq ft',
        });
        estimatedDuration += 2;
      }
    }

    // Factor 2: Job complexity (based on price)
    const totalPrice = parseFloat(job.totalPrice?.toString() || '0');
    if (totalPrice > 15000) {
      factors.push({
        name: 'Complex Job',
        impact: 3,
        reason: 'High-value job typically requires more time',
      });
      estimatedDuration += 3;
    }

    // Factor 3: Season (winter/summer considerations)
    const month = new Date().getMonth();
    if (month >= 11 || month <= 2) {
      // Winter months
      factors.push({
        name: 'Winter Season',
        impact: 2,
        reason: 'Shorter days and cold weather slow work',
      });
      estimatedDuration += 2;
    }

    // Factor 4: Insurance claim
    if (job.lead?.claimNumber) {
      factors.push({
        name: 'Insurance Work',
        impact: 1,
        reason: 'Additional documentation time required',
      });
      estimatedDuration += 1;
    }

    // Calculate confidence based on historical data
    const confidence = Math.min(
      100,
      Math.floor((historicalDurations.length / 10) * 100),
    );

    // Round to nearest half hour
    estimatedDuration = Math.round(estimatedDuration * 2) / 2;

    return {
      jobId,
      estimatedDuration,
      confidence,
      factors,
      historicalComparison: {
        similar: similarJobs.length,
        averageDuration: Math.round(averageDuration * 2) / 2,
        range: {
          min: Math.round(minDuration * 2) / 2,
          max: Math.round(maxDuration * 2) / 2,
        },
      },
    };
  }

  /**
   * Get smart scheduling recommendation for a job
   */
  async getSchedulingRecommendation(
    tenantId: string,
    jobId: string,
  ): Promise<SchedulingRecommendation> {
    this.logger.log(`Getting scheduling recommendation for job ${jobId}`);

    const job = await this.db.job.findFirst({
      where: { id: jobId, tenantId },
      include: {
        property: true,
        lead: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Get job duration prediction
    const durationPrediction = await this.predictJobDuration(tenantId, jobId);

    // Get weather forecast for property location
    const latitude = job.property?.latitude || 40.7128;
    const longitude = job.property?.longitude || -74.0060;
    const weatherForecast = await this.getWeatherForecast(latitude, longitude, 14);

    // Get available crews
    const crews = await this.getAvailableCrews(tenantId);

    // Find best dates (good weather, available crew)
    const suitableDates = weatherForecast.filter((w) => w.suitable);

    // Score each date
    const scoredDates = await Promise.all(
      suitableDates.slice(0, 5).map(async (weather) => {
        const availableCrew = await this.findBestCrew(
          tenantId,
          weather.date,
          durationPrediction.estimatedDuration,
          crews,
        );

        // Calculate score
        let score = 100;

        // Weather score (50 points)
        score -= weather.precipitation * 0.3; // Reduce by precipitation %
        score -= Math.max(0, (weather.windSpeed - 10) * 2); // Penalize high winds

        // Crew score (30 points)
        if (availableCrew.length === 0) score -= 50;
        const avgCrewPerformance =
          availableCrew.reduce((sum, c) => sum + c.performance, 0) / (availableCrew.length || 1);
        score += (avgCrewPerformance / 100) * 30;

        // Date score (20 points) - prefer sooner dates
        const daysOut = Math.floor(
          (weather.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        score -= daysOut * 0.5; // Slight penalty for far-out dates

        return {
          date: weather.date,
          crew: availableCrew,
          score: Math.max(0, score),
          weather,
        };
      }),
    );

    // Sort by score
    scoredDates.sort((a, b) => b.score - a.score);

    const best = scoredDates[0];
    const alternatives = scoredDates.slice(1, 4);

    // Determine weather risk
    let weatherRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (best.weather.precipitation > 20) weatherRisk = 'MEDIUM';
    if (best.weather.precipitation > 40 || best.weather.windSpeed > 15) weatherRisk = 'HIGH';

    // Generate reasoning
    const reasoning = [
      `Weather is favorable: ${best.weather.conditions}`,
      `${best.crew.length} crew members available`,
      `Estimated duration: ${durationPrediction.estimatedDuration} hours`,
    ];

    if (best.weather.warnings.length > 0) {
      reasoning.push(`Warnings: ${best.weather.warnings.join(', ')}`);
    }

    return {
      jobId,
      recommendedDate: best.date,
      recommendedCrew: best.crew,
      confidence: Math.round(best.score),
      reasoning,
      alternatives: alternatives.map((alt) => ({
        date: alt.date,
        crew: alt.crew,
        score: Math.round(alt.score),
      })),
      estimatedDuration: durationPrediction.estimatedDuration,
      weatherRisk,
    };
  }

  /**
   * Get available crews
   */
  private async getAvailableCrews(tenantId: string): Promise<CrewMember[]> {
    // Get all crew members (users with CREW role)
    const users = await this.db.user.findMany({
      where: {
        tenantId,
        role: 'CREW',
      },
      include: {
        contact: true,
      },
    });

    // Get their current job assignments
    const now = new Date();
    const activeJobs = await this.db.job.findMany({
      where: {
        tenantId,
        status: 'IN_PROGRESS',
        startedAt: { lte: now },
      },
    });

    return users.map((user) => {
      const currentLoad = activeJobs.filter(
        (job) => (job as any).assignedCrewId === user.id,
      ).length;

      return {
        id: user.id,
        name: `${user.contact.firstName} ${user.contact.lastName}`,
        role: user.role,
        skills: [], // Would be populated from user profile
        availability: [], // Would be populated from calendar
        currentLoad,
        performance: 85, // Would be calculated from historical data
      };
    });
  }

  /**
   * Find best crew for a date
   */
  private async findBestCrew(
    tenantId: string,
    date: Date,
    duration: number,
    allCrews: CrewMember[],
  ): Promise<CrewMember[]> {
    // For now, return crews with lowest current load
    const sortedCrews = [...allCrews].sort((a, b) => a.currentLoad - b.currentLoad);

    // Return top 3 for typical roofing job
    return sortedCrews.slice(0, 3);
  }

  /**
   * Optimize crew assignments for a given date
   */
  async optimizeCrewSchedule(tenantId: string, date: Date): Promise<CrewOptimization> {
    this.logger.log(`Optimizing crew schedule for ${date.toISOString().split('T')[0]}`);

    // Get all jobs scheduled for this date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const scheduledJobs = await this.db.job.findMany({
      where: {
        tenantId,
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      },
      include: {
        property: true,
        lead: true,
      },
    });

    // Get available crews
    const availableCrews = await this.getAvailableCrews(tenantId);

    // Get duration predictions for all jobs
    const jobsWithDurations = await Promise.all(
      scheduledJobs.map(async (job) => {
        const prediction = await this.predictJobDuration(tenantId, job.id);
        return { ...job, estimatedDuration: prediction.estimatedDuration };
      }),
    );

    // Organize crews (simple algorithm - would be more complex in production)
    const crews: any[] = [];
    const recommendations: string[] = [];

    // Calculate total hours needed
    const totalHours = jobsWithDurations.reduce((sum, j) => sum + j.estimatedDuration, 0);
    const availableHours = availableCrews.length * 8; // Assume 8-hour workday

    const utilization = (totalHours / availableHours) * 100;

    if (utilization > 100) {
      recommendations.push(
        'WARNING: Overbooked - consider rescheduling some jobs or adding crew',
      );
    } else if (utilization < 50) {
      recommendations.push('Underutilized - consider scheduling additional jobs');
    }

    // Simple crew assignment (would use more sophisticated algorithm)
    let crewIndex = 0;
    for (const job of jobsWithDurations) {
      if (!crews[crewIndex]) {
        crews[crewIndex] = {
          members: [availableCrews[crewIndex % availableCrews.length]],
          jobs: [],
          totalHours: 0,
          utilization: 0,
          conflicts: [],
        };
      }

      crews[crewIndex].jobs.push(job);
      crews[crewIndex].totalHours += job.estimatedDuration;
      crews[crewIndex].utilization = (crews[crewIndex].totalHours / 8) * 100;

      if (crews[crewIndex].totalHours > 10) {
        crews[crewIndex].conflicts.push('Exceeds safe working hours');
      }

      crewIndex = (crewIndex + 1) % Math.max(1, availableCrews.length);
    }

    const efficiency = Math.min(100, utilization);

    return {
      date,
      crews,
      recommendations,
      efficiency: Math.round(efficiency),
    };
  }

  /**
   * Check for jobs that need rescheduling due to weather
   */
  async checkRescheduleAlerts(tenantId: string, days: number = 7): Promise<RescheduleAlert[]> {
    this.logger.log(`Checking reschedule alerts for next ${days} days`);

    const alerts: RescheduleAlert[] = [];

    // Get all scheduled jobs in the next N days
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const jobs = await this.db.job.findMany({
      where: {
        tenantId,
        scheduledDate: {
          gte: startDate,
          lte: endDate,
        },
        status: 'SCHEDULED',
      },
      include: {
        property: true,
      },
    });

    // Check weather for each job
    for (const job of jobs) {
      if (!job.scheduledDate) continue;

      const latitude = job.property?.latitude || 40.7128;
      const longitude = job.property?.longitude || -74.0060;

      const forecast = await this.getWeatherForecast(latitude, longitude, 7);

      // Find forecast for scheduled date
      const scheduledDateStr = job.scheduledDate.toISOString().split('T')[0];
      const dayForecast = forecast.find(
        (f) => f.date.toISOString().split('T')[0] === scheduledDateStr,
      );

      if (!dayForecast) continue;

      // Determine if rescheduling needed
      if (!dayForecast.suitable) {
        let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
        let autoReschedule = false;

        if (dayForecast.precipitation > 70 || dayForecast.windSpeed > 25) {
          severity = 'CRITICAL';
          autoReschedule = true;
        } else if (dayForecast.precipitation > 50) {
          severity = 'HIGH';
          autoReschedule = true;
        }

        // Find alternative date
        const suitableDay = forecast.find((f) => f.suitable && f.date > job.scheduledDate!);
        const suggestedNewDate = suitableDay?.date || new Date(job.scheduledDate);
        suggestedNewDate.setDate(suggestedNewDate.getDate() + 3);

        alerts.push({
          jobId: job.id,
          currentDate: job.scheduledDate,
          reason: `Poor weather: ${dayForecast.conditions}. ${dayForecast.warnings.join(', ')}`,
          severity,
          suggestedNewDate,
          autoReschedule,
        });
      }
    }

    return alerts;
  }

  /**
   * Automatically reschedule a job
   */
  async autoRescheduleJob(tenantId: string, jobId: string, newDate: Date): Promise<any> {
    this.logger.log(`Auto-rescheduling job ${jobId} to ${newDate}`);

    const job = await this.db.job.findFirst({
      where: { id: jobId, tenantId },
      include: { lead: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Update job scheduled date
    const updatedJob = await this.db.job.update({
      where: { id: jobId },
      data: {
        scheduledDate: newDate,
      },
    });

    // Create note about rescheduling
    await this.db.note.create({
      data: {
        tenantId,
        jobId,
        leadId: job.leadId,
        content: `Job automatically rescheduled from ${job.scheduledDate?.toLocaleDateString()} to ${newDate.toLocaleDateString()} due to weather conditions.`,
        createdById: 'system',
      },
    });

    return {
      success: true,
      job: updatedJob,
      oldDate: job.scheduledDate,
      newDate,
    };
  }

  /**
   * Get production dashboard summary
   */
  async getProductionDashboard(tenantId: string): Promise<any> {
    this.logger.log('Getting production dashboard');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    // Get stats
    const [scheduledToday, scheduledThisWeek, inProgress, rescheduleAlerts] = await Promise.all([
      this.db.job.count({
        where: {
          tenantId,
          scheduledDate: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.db.job.count({
        where: {
          tenantId,
          scheduledDate: {
            gte: today,
            lt: endOfWeek,
          },
        },
      }),
      this.db.job.count({
        where: {
          tenantId,
          status: 'IN_PROGRESS',
        },
      }),
      this.checkRescheduleAlerts(tenantId, 7),
    ]);

    // Get crew utilization
    const crews = await this.getAvailableCrews(tenantId);
    const avgUtilization =
      crews.reduce((sum, c) => sum + (c.currentLoad / 5) * 100, 0) / (crews.length || 1);

    return {
      summary: {
        scheduledToday,
        scheduledThisWeek,
        inProgress,
        alertCount: rescheduleAlerts.length,
        crewCount: crews.length,
        avgCrewUtilization: Math.round(avgUtilization),
      },
      alerts: rescheduleAlerts.filter((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL'),
      upcomingJobs: await this.db.job.findMany({
        where: {
          tenantId,
          scheduledDate: {
            gte: today,
            lt: endOfWeek,
          },
        },
        include: {
          property: true,
          lead: { include: { contact: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 10,
      }),
    };
  }

  /**
   * Get AI recommendations for production optimization
   */
  async getProductionRecommendations(tenantId: string): Promise<string[]> {
    this.logger.log('Getting AI production recommendations');

    const dashboard = await this.getProductionDashboard(tenantId);

    const prompt = `You are an expert roofing production manager. Analyze this data and provide 5 specific, actionable recommendations:

Scheduled Today: ${dashboard.summary.scheduledToday}
Scheduled This Week: ${dashboard.summary.scheduledThisWeek}
In Progress: ${dashboard.summary.inProgress}
Weather Alerts: ${dashboard.summary.alertCount}
Crew Count: ${dashboard.summary.crewCount}
Avg Crew Utilization: ${dashboard.summary.avgCrewUtilization}%

Provide recommendations as JSON array of strings:
["recommendation 1", "recommendation 2", ...]`;

    try {
      const response = await this.ollama.generate({
        model: 'gemma2:27b',
        prompt,
        options: {
          temperature: 0.7,
        },
      });

      return JSON.parse(response);
    } catch (error) {
      this.logger.error(`Failed to get AI recommendations: ${error.message}`);

      // Fallback recommendations
      const recommendations = [];

      if (dashboard.summary.avgCrewUtilization > 80) {
        recommendations.push('Consider hiring additional crew members - utilization is high');
      }

      if (dashboard.summary.alertCount > 3) {
        recommendations.push(
          'Multiple weather alerts - review schedule and proactively contact customers',
        );
      }

      if (dashboard.summary.scheduledToday < 2 && dashboard.summary.crewCount > 5) {
        recommendations.push('Low job volume today - consider moving up future jobs');
      }

      return recommendations;
    }
  }
}
