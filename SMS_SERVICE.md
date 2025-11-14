# 📱 SMS Service - Complete Guide

**Status:** ✅ Fully Implemented
**Provider:** Twilio
**Location:** `apps/api/src/modules/sms/`

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Setup & Configuration](#setup--configuration)
4. [API Endpoints](#api-endpoints)
5. [Usage Examples](#usage-examples)
6. [SMS Templates](#sms-templates)
7. [SMS Campaigns](#sms-campaigns)
8. [Webhooks](#webhooks)
9. [Best Practices](#best-practices)

---

## 🎯 Overview

The SMS Service provides complete SMS/text messaging capabilities for your roofing CRM using Twilio. It includes:

- **Send individual or bulk SMS** messages
- **Templated SMS** with variable substitution
- **SMS campaigns** for marketing and notifications
- **Scheduled SMS** for future delivery
- **Incoming SMS handling** with automatic contact matching
- **Delivery tracking** and status updates
- **10 predefined roofing templates** ready to use

---

## ✨ Features

### Core SMS Functionality
- ✅ Send SMS to individual phone numbers
- ✅ Send bulk SMS to multiple recipients
- ✅ Schedule SMS for future delivery
- ✅ Cancel scheduled messages
- ✅ Send MMS (images/media)
- ✅ E.164 phone number validation
- ✅ Automatic US number formatting (+1)

### Template Management
- ✅ Create custom SMS templates
- ✅ Variable substitution ({{firstName}}, {{date}}, etc.)
- ✅ Template categories (appointments, sales, billing, etc.)
- ✅ 10 predefined roofing templates
- ✅ Template validation
- ✅ Duplicate templates
- ✅ Render preview with variables

### Campaign Management
- ✅ Create SMS campaigns
- ✅ Recipient filtering (by lead source, status, tags, zip codes)
- ✅ Campaign scheduling
- ✅ Bulk sending with progress tracking
- ✅ Campaign statistics (sent, delivered, failed rates)
- ✅ Preview recipients before sending
- ✅ Duplicate campaigns

### Tracking & Analytics
- ✅ SMS message history by contact
- ✅ SMS message history by phone number
- ✅ Delivery status tracking
- ✅ Campaign performance metrics
- ✅ Tenant-wide SMS statistics
- ✅ Delivery rate calculations

### Webhooks & Automation
- ✅ Incoming SMS webhook
- ✅ Status callback webhook
- ✅ Auto-match incoming SMS to contacts
- ✅ Auto-create notes for matched contacts

---

## 🔧 Setup & Configuration

### 1. Get Twilio Credentials

1. Sign up at [Twilio](https://www.twilio.com/)
2. Get a Twilio phone number
3. Find your Account SID and Auth Token from the [Twilio Console](https://console.twilio.com/)

### 2. Configure Environment Variables

Add these to your `.env` file:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15555551234
```

### 3. Install Dependencies

```bash
cd apps/api
pnpm install
```

The `twilio` package is already in `package.json`.

### 4. Configure Webhooks

In the [Twilio Console](https://console.twilio.com/), configure your phone number with these webhooks:

**Incoming Messages:**
```
https://your-domain.com/api/sms/webhooks/incoming
```

**Status Callbacks:**
```
https://your-domain.com/api/sms/webhooks/status
```

### 5. Verify Setup

```bash
GET /api/sms/status
```

Response:
```json
{
  "available": true,
  "provider": "twilio"
}
```

---

## 🔌 API Endpoints

### Sending SMS

#### Send Single SMS
```http
POST /api/sms/send
Content-Type: application/json

{
  "to": "+15555551234",
  "message": "Hi John, your roof inspection is confirmed for tomorrow at 2pm.",
  "from": "+15555556789",  // Optional, uses default if not provided
  "mediaUrls": ["https://..."]  // Optional MMS images
}
```

#### Send Templated SMS
```http
POST /api/sms/send-templated
Content-Type: application/json

{
  "to": "+15555551234",
  "templateId": "tpl_...",
  "variables": {
    "firstName": "John",
    "date": "Tomorrow",
    "time": "2pm"
  }
}
```

#### Send Bulk SMS
```http
POST /api/sms/send-bulk
Content-Type: application/json

{
  "recipients": [
    {
      "contactId": "contact_1",
      "phone": "+15555551234",
      "variables": {
        "firstName": "John",
        "date": "Tomorrow"
      }
    },
    {
      "contactId": "contact_2",
      "phone": "+15555555678",
      "variables": {
        "firstName": "Jane",
        "date": "Next Week"
      }
    }
  ],
  "templateId": "tpl_...",
  "message": "Alternative message text"
}
```

#### Schedule SMS
```http
POST /api/sms/schedule
Content-Type: application/json

{
  "to": "+15555551234",
  "message": "Reminder: Your appointment is in 1 hour!",
  "scheduledAt": "2025-11-15T13:00:00Z"
}
```

#### Cancel Scheduled SMS
```http
DELETE /api/sms/scheduled/:messageId
```

---

### History & Stats

#### Get Contact SMS History
```http
GET /api/sms/history/contact/:contactId
```

#### Get Phone Number SMS History
```http
GET /api/sms/history/phone/:phone
```

#### Get SMS Statistics
```http
GET /api/sms/stats?startDate=2025-11-01&endDate=2025-11-30
```

Response:
```json
{
  "total": 1250,
  "sent": 1200,
  "delivered": 1150,
  "failed": 50,
  "inbound": 150,
  "outbound": 1100,
  "deliveryRate": 95.83
}
```

---

### Templates

#### Create Template
```http
POST /api/sms/templates
Content-Type: application/json

{
  "name": "Appointment Confirmation",
  "body": "Hi {{firstName}}, your roof inspection is confirmed for {{date}} at {{time}}.",
  "category": "appointments",
  "variables": ["firstName", "date", "time"],
  "isActive": true
}
```

#### Get All Templates
```http
GET /api/sms/templates?category=appointments&isActive=true
```

#### Get Single Template
```http
GET /api/sms/templates/:templateId
```

#### Update Template
```http
PUT /api/sms/templates/:templateId
Content-Type: application/json

{
  "name": "Updated Template Name",
  "body": "Updated message with {{newVariable}}"
}
```

#### Delete Template
```http
DELETE /api/sms/templates/:templateId
```

#### Duplicate Template
```http
POST /api/sms/templates/:templateId/duplicate
Content-Type: application/json

{
  "name": "Appointment Confirmation (Copy)"
}
```

#### Render Template Preview
```http
POST /api/sms/templates/:templateId/render
Content-Type: application/json

{
  "variables": {
    "firstName": "John",
    "date": "Tomorrow",
    "time": "2pm"
  }
}
```

Response:
```json
{
  "rendered": "Hi John, your roof inspection is confirmed for Tomorrow at 2pm."
}
```

#### Get Predefined Templates
```http
GET /api/sms/templates/predefined
```

#### Install Predefined Templates
```http
POST /api/sms/templates/install-predefined
```

#### Get Template Categories
```http
GET /api/sms/templates/categories
```

---

### Campaigns

#### Create Campaign
```http
POST /api/sms/campaigns
Content-Type: application/json

{
  "name": "Holiday Promotion",
  "templateId": "tpl_...",
  "scheduledAt": "2025-11-20T09:00:00Z",
  "recipientFilters": {
    "leadSource": ["WEBSITE", "REFERRAL"],
    "leadStatus": ["QUALIFIED"],
    "tags": ["VIP"],
    "zipCodes": ["90210", "90211"]
  }
}
```

#### Get All Campaigns
```http
GET /api/sms/campaigns?status=SCHEDULED
```

#### Get Single Campaign
```http
GET /api/sms/campaigns/:campaignId
```

#### Update Campaign
```http
PUT /api/sms/campaigns/:campaignId
Content-Type: application/json

{
  "name": "Updated Campaign Name",
  "scheduledAt": "2025-11-21T09:00:00Z"
}
```

#### Execute Campaign
```http
POST /api/sms/campaigns/:campaignId/execute
```

#### Cancel Campaign
```http
POST /api/sms/campaigns/:campaignId/cancel
```

#### Delete Campaign
```http
DELETE /api/sms/campaigns/:campaignId
```

#### Get Campaign Stats
```http
GET /api/sms/campaigns/:campaignId/stats
```

Response:
```json
{
  "id": "camp_...",
  "name": "Holiday Promotion",
  "status": "COMPLETED",
  "totalRecipients": 500,
  "sent": 500,
  "delivered": 485,
  "failed": 15,
  "deliveryRate": 97.0,
  "failureRate": 3.0,
  "startedAt": "2025-11-20T09:00:00Z",
  "completedAt": "2025-11-20T09:15:00Z",
  "duration": 900000
}
```

#### Duplicate Campaign
```http
POST /api/sms/campaigns/:campaignId/duplicate
Content-Type: application/json

{
  "name": "Holiday Promotion 2"
}
```

#### Preview Campaign Recipients
```http
POST /api/sms/campaigns/preview-recipients
Content-Type: application/json

{
  "recipientFilters": {
    "leadSource": ["STORM"],
    "zipCodes": ["90210"]
  },
  "limit": 10
}
```

Response:
```json
{
  "total": 245,
  "sample": [
    {
      "contactId": "contact_1",
      "phone": "+15555551234",
      "variables": {
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  ]
}
```

---

## 💡 Usage Examples

### Example 1: Send Appointment Reminder

```typescript
// Send appointment reminder 1 day before
const result = await smsService.sendTemplatedSms(
  tenantId,
  'tpl_appointment_reminder',
  '+15555551234',
  {
    firstName: 'John',
    time: '2:00 PM',
    address: '123 Main St',
    companyName: 'ABC Roofing'
  }
);
```

### Example 2: Storm Alert Campaign

```typescript
// Create campaign for storm-affected areas
const campaign = await campaignsService.create(tenantId, {
  name: 'Hail Storm Alert - 90210',
  templateId: 'tpl_storm_alert',
  recipientFilters: {
    zipCodes: ['90210', '90211'],
    leadStatus: ['NEW', 'CONTACTED']
  }
});

// Execute immediately
await campaignsService.execute(tenantId, campaign.id);
```

### Example 3: Scheduled Follow-Up

```typescript
// Schedule follow-up SMS for 3 days from now
const followUpDate = new Date();
followUpDate.setDate(followUpDate.getDate() + 3);

await smsService.scheduleSms(tenantId, {
  to: '+15555551234',
  message: 'Hi John, just checking in on your roofing estimate. Any questions?',
  scheduledAt: followUpDate
});
```

### Example 4: On-The-Way Notification

```typescript
// Notify customer when tech is en route
await smsService.sendTemplatedSms(
  tenantId,
  'tpl_on_the_way',
  customer.phone,
  {
    firstName: customer.firstName,
    techName: crew.leader.name,
    address: job.property.address,
    eta: '15'
  }
);
```

---

## 📝 SMS Templates

### Predefined Templates (10 Included)

The system includes 10 ready-to-use templates for common roofing scenarios:

#### 1. Appointment Confirmation
```
Hi {{firstName}}, this confirms your roofing inspection on {{date}} at {{time}}.
We'll call 15 mins before arrival. Reply STOP to cancel.
```
**Category:** appointments
**Variables:** firstName, date, time

#### 2. Appointment Reminder
```
Reminder: Your roof inspection is tomorrow at {{time}}. {{address}}.
See you then! - {{companyName}}
```
**Category:** appointments
**Variables:** time, address, companyName

#### 3. On The Way
```
Hi {{firstName}}, our technician {{techName}} is on the way to {{address}}.
ETA: {{eta}} minutes.
```
**Category:** field
**Variables:** firstName, techName, address, eta

#### 4. Quote Ready
```
Good news {{firstName}}! Your roof estimate is ready.
View it here: {{portalLink}}. Questions? Call {{phone}}.
```
**Category:** sales
**Variables:** firstName, portalLink, phone

#### 5. Follow Up
```
Hi {{firstName}}, just following up on your roofing estimate from {{date}}.
Do you have any questions? - {{salesRep}}
```
**Category:** sales
**Variables:** firstName, date, salesRep

#### 6. Storm Alert
```
STORM ALERT: {{stormType}} reported in {{area}}.
Free roof inspections available. Call {{phone}} or book online: {{bookingLink}}
```
**Category:** marketing
**Variables:** stormType, area, phone, bookingLink

#### 7. Job Start
```
Hi {{firstName}}, your roof replacement starts {{date}}.
Crew will arrive at {{time}}. Questions? Call {{foreman}} at {{phone}}.
```
**Category:** production
**Variables:** firstName, date, time, foreman, phone

#### 8. Job Complete
```
Your roof is complete! Final walkthrough scheduled for {{date}} at {{time}}.
Thank you for choosing {{companyName}}!
```
**Category:** production
**Variables:** date, time, companyName

#### 9. Payment Reminder
```
Hi {{firstName}}, your {{amount}} payment is due {{dueDate}}.
Pay online: {{paymentLink}} or call {{phone}}.
```
**Category:** billing
**Variables:** firstName, amount, dueDate, paymentLink, phone

#### 10. Review Request
```
Thanks for choosing {{companyName}}! We'd love your feedback.
Leave a review: {{reviewLink}}
```
**Category:** feedback
**Variables:** companyName, reviewLink

### Template Categories

- **appointments** - Booking confirmations and reminders
- **sales** - Quotes, estimates, follow-ups
- **field** - On-site notifications, tech arrivals
- **production** - Job start/complete notifications
- **billing** - Invoices, payment reminders
- **marketing** - Storm alerts, promotions
- **feedback** - Review requests, satisfaction surveys

---

## 🚀 SMS Campaigns

### Campaign Workflow

1. **Create Campaign** - Define name, template, recipients
2. **Preview Recipients** - Check who will receive the messages
3. **Schedule or Execute** - Send now or schedule for later
4. **Monitor Progress** - Track sent/delivered/failed counts
5. **View Statistics** - Analyze campaign performance

### Recipient Filtering

Campaigns support powerful filtering options:

```typescript
{
  recipientFilters: {
    // Filter by lead source
    leadSource: ['STORM', 'CANVASSING', 'REFERRAL'],

    // Filter by lead status
    leadStatus: ['QUALIFIED', 'CONTACTED'],

    // Filter by job status
    jobStatus: ['SOLD', 'SCHEDULED'],

    // Filter by contact tags
    tags: ['VIP', 'High-Value'],

    // Filter by zip codes
    zipCodes: ['90210', '90211', '90212']
  }
}
```

### Campaign Best Practices

1. **Always preview recipients** before executing
2. **Test with small groups** before full campaigns
3. **Schedule during business hours** (9am-6pm local time)
4. **Avoid weekends** unless time-sensitive
5. **Include opt-out language** (e.g., "Reply STOP to cancel")
6. **Track delivery rates** and investigate failures
7. **Segment your audience** for better targeting

---

## 🔗 Webhooks

### Incoming SMS Webhook

**Endpoint:** `POST /api/sms/webhooks/incoming`

Handles incoming SMS messages from customers:
- Stores message in database
- Attempts to match sender to existing contact
- Auto-creates note on matched contact
- Returns 200 OK to Twilio

**Twilio sends:**
```
MessageSid=SMxxxxxxxx
From=+15555551234
To=+15555556789
Body=Yes, I'm interested in a free inspection
NumMedia=0
```

### Status Callback Webhook

**Endpoint:** `POST /api/sms/webhooks/status`

Receives delivery status updates:
- Updates message status in database
- Tracks delivery timestamps
- Records error codes if failed

**Statuses:**
- `QUEUED` - Message queued for delivery
- `SENT` - Message sent to carrier
- `DELIVERED` - Message delivered to recipient
- `FAILED` - Delivery failed
- `UNDELIVERED` - Could not be delivered

---

## ✅ Best Practices

### Phone Number Formatting

The service auto-formats US numbers:
```
Input: (555) 555-1234  →  Output: +15555551234
Input: 555-555-1234    →  Output: +15555551234
Input: 5555551234      →  Output: +15555551234
```

For international numbers, always use E.164 format: `+{country_code}{number}`

### Message Length

- **Standard SMS:** 160 characters max (auto-splits into multiple if longer)
- **Recommended:** Keep under 160 for single message
- **Template max:** 1600 characters (enforced by service)

### Rate Limiting

Twilio rate limits:
- **Default:** 1 message/second
- **High volume:** Contact Twilio to increase

For bulk campaigns, the service automatically handles rate limiting.

### Compliance

**Always include:**
- Company name
- Opt-out instructions ("Reply STOP to unsubscribe")
- Contact information

**Never send:**
- Unsolicited marketing to people without consent
- Messages outside 8am-9pm local time (except emergencies)
- Messages to phone numbers on Do Not Call lists

### Cost Optimization

- Use templates to avoid typos and reduce testing
- Preview recipients before sending campaigns
- Monitor delivery rates and remove invalid numbers
- Schedule messages during business hours for better delivery
- Use MMS sparingly (costs more than SMS)

### Error Handling

Common errors and solutions:

**Invalid phone number:**
- Ensure E.164 format
- Validate before sending

**Delivery failed:**
- Number may be inactive
- Carrier issues
- Check Twilio logs for details

**Undelivered:**
- Phone turned off
- Out of coverage
- Will retry automatically

---

## 📊 Statistics & Analytics

### Available Metrics

- **Total messages** sent/received
- **Delivery rate** (delivered / sent × 100)
- **Failure rate** (failed / sent × 100)
- **Inbound vs outbound** ratio
- **Campaign performance** (per-campaign stats)
- **Historical trends** (by date range)

### Tracking Message Lifecycle

```
SCHEDULED → QUEUED → SENT → DELIVERED
                         ↓
                      FAILED
```

---

## 🔐 Security

- **Credentials encrypted** in environment variables
- **Webhook verification** ensures requests are from Twilio
- **Tenant isolation** - each tenant's messages are separate
- **API authentication** required for all endpoints
- **Rate limiting** prevents abuse

---

## 🆘 Troubleshooting

### SMS not sending

1. Check Twilio credentials in `.env`
2. Verify `/api/sms/status` shows `available: true`
3. Check phone number format (E.164)
4. Check Twilio account balance
5. Review Twilio console logs

### Webhooks not working

1. Verify webhook URLs in Twilio console
2. Ensure URLs are publicly accessible (use ngrok for local dev)
3. Check webhook endpoint returns 200 OK
4. Review Twilio webhook debugger

### Messages marked as failed

1. Check recipient number is valid and active
2. Review error message in SMS record
3. Check Twilio error codes documentation
4. Verify carrier accepts messages

---

## 📈 Next Steps

After setting up SMS, you can:

1. **Integrate with automations** - Auto-send SMS on job status changes
2. **Add to AI assistant** - Let AI send SMS via tool calling
3. **Build workflows** - Create multi-step SMS sequences
4. **Add analytics dashboard** - Visualize SMS performance
5. **Implement chatbot** - Auto-respond to common incoming SMS

---

## 🎯 Quick Start Checklist

- [ ] Sign up for Twilio account
- [ ] Get Twilio phone number
- [ ] Add credentials to `.env`
- [ ] Install dependencies (`pnpm install`)
- [ ] Verify setup (`GET /api/sms/status`)
- [ ] Install predefined templates
- [ ] Configure webhooks in Twilio console
- [ ] Send test SMS
- [ ] Create first campaign
- [ ] Monitor delivery rates

---

**🎉 You're ready to send SMS!**

For support, check the [Twilio Documentation](https://www.twilio.com/docs/sms) or raise an issue in the project repository.
