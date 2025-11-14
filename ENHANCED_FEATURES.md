# Enhanced Roofing CRM - Advanced Features Implementation Plan

## 🤖 AI Integration with Ollama

### Local LLM Integration
**Supported Models:**
- Gemma 3 27B (Google's latest, optimized for reasoning)
- Llama 3.1/3.2 (Meta's flagship models)
- Mixtral (for fast responses)
- CodeLlama (for technical documentation)

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│                    API Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ OpenAI API   │  │  Ollama API  │  │  Claude API  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   AI Router Service  │
              │  (Model Selection)   │
              └──────────┬──────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
┌───────▼────────┐ ┌────▼────────┐ ┌────▼────────┐
│ General AI     │ │  Voice AI   │ │  Document   │
│ Assistant      │ │  (Calls)    │ │  Analysis   │
└────────────────┘ └─────────────┘ └─────────────┘
```

**AI Tools & Functions:**
1. **Lead Management:**
   - `create_lead(data)` - Create new lead from conversation
   - `update_lead(id, data)` - Update lead information
   - `score_lead(id)` - AI-powered lead scoring
   - `find_leads(filters)` - Search and filter leads

2. **Appointment Management:**
   - `book_appointment(lead_id, date, time, type)` - Schedule appointments
   - `reschedule_appointment(id, new_date, new_time)` - Reschedule
   - `cancel_appointment(id, reason)` - Cancel with notification
   - `find_available_slots(date_range, duration)` - Check availability

3. **Job Operations:**
   - `create_job(data)` - Convert lead to job
   - `update_job_status(id, status)` - Update pipeline stage
   - `get_job_details(id)` - Fetch complete job information
   - `calculate_estimate(property_details)` - AI-powered estimating

4. **Communication:**
   - `send_email(to, template, data)` - Send templated emails
   - `send_sms(to, message)` - Send SMS messages
   - `create_follow_up(entity_id, days)` - Schedule follow-up tasks
   - `draft_message(context, type)` - AI-generated content

5. **Document Operations:**
   - `generate_proposal(job_id)` - Create PDF proposals
   - `analyze_roof_photo(image_url)` - Damage detection
   - `extract_insurance_info(document)` - Parse insurance docs
   - `summarize_conversation(messages)` - Call/email summaries

6. **Analytics & Insights:**
   - `get_pipeline_health()` - Pipeline analysis
   - `forecast_revenue(period)` - Revenue predictions
   - `identify_at_risk_jobs()` - Churn prevention
   - `suggest_next_action(job_id)` - Recommendation engine

**Voice AI Call Handling:**
```typescript
Voice AI Features:
├── Inbound Call Handling
│   ├── Caller identification & lookup
│   ├── Natural conversation flow
│   ├── Lead qualification questions
│   ├── Appointment booking
│   ├── Emergency routing
│   └── Voicemail transcription
├── Outbound Calling
│   ├── Appointment reminders (24hr before)
│   ├── Follow-up calls
│   ├── Payment reminders
│   └── Review requests
├── Real-time Features
│   ├── Live transcription
│   ├── Sentiment analysis
│   ├── Action item extraction
│   └── Auto-logging to CRM
└── Voice Commands
    ├── "Transfer to [person]"
    ├── "Send estimate"
    ├── "Schedule callback"
    └── "Create urgent lead"
```

**Integration Stack:**
- Ollama: Local LLM inference
- Whisper: Speech-to-text
- ElevenLabs or Deepgram: Text-to-speech
- Twilio: Phone infrastructure
- WebSockets: Real-time communication

---

## 📱 Communication Systems

### 1. SMS Integration (Twilio)

**Features:**
- Two-way SMS conversations
- Bulk messaging campaigns
- Appointment reminders (auto-sent 24hr, 1hr before)
- Lead nurturing sequences
- Payment reminders
- Photo sharing via MMS
- SMS-to-ticket conversion
- Short links for portal access

**Message Templates:**
```typescript
SMS Templates:
├── Lead Engagement
│   ├── "Thanks for your interest! Can we schedule an inspection?"
│   ├── "Storm in your area! Free roof inspection available."
│   └── "Your estimate is ready: [portal_link]"
├── Appointments
│   ├── "Reminder: Inspection tomorrow at [time] with [rep]"
│   ├── "On my way! Arriving in 15 minutes."
│   └── "Appointment confirmed for [date] at [time]"
├── Production
│   ├── "Your roof installation starts [date]!"
│   ├── "Day 2 progress update: [photos]"
│   └── "Project completed! View photos: [link]"
└── Collections
    ├── "Final payment of $X due. Pay now: [link]"
    ├── "Invoice overdue. Please call to discuss."
    └── "Payment received! Thanks for your business."
```

### 2. Internal Messaging System

**Real-time Features:**
- One-on-one messaging
- Team/department channels
- @mentions and notifications
- File sharing (photos, docs)
- Message threads
- Read receipts
- Typing indicators
- Message search and filters
- Pin important messages
- Emoji reactions

**Architecture:**
- Socket.io for real-time delivery
- Redis for pub/sub
- PostgreSQL for message persistence
- S3 for file attachments

### 3. Email System

**Email Types:**
```typescript
Email Capabilities:
├── Transactional
│   ├── Welcome emails
│   ├── Password resets
│   ├── Appointment confirmations
│   └── Invoice delivery
├── Marketing
│   ├── Drip campaigns
│   ├── Seasonal promotions
│   ├── Storm alerts
│   └── Newsletter
├── Operational
│   ├── Estimates & proposals
│   ├── Contract signing
│   ├── Payment receipts
│   └── Project updates
└── Automated
    ├── Follow-up sequences
    ├── Abandoned estimate reminders
    ├── Review requests
    └── Warranty information
```

**Template Engine:**
- Handlebars templates
- Personalization tokens
- Brand customization
- A/B testing capability
- Open/click tracking
- Unsubscribe management

**Email Providers:**
- Primary: SendGrid or AWS SES
- Backup: Postmark
- Development: MailDev (local)

### 4. Unified Notifications System

**Notification Channels:**
```
┌──────────────────────────────────────────┐
│        Notification Router               │
└───────────┬──────────────────────────────┘
            │
    ┌───────┼───────┬───────┬──────────┐
    │       │       │       │          │
┌───▼───┐ ┌▼────┐ ┌▼────┐ ┌▼──────┐ ┌▼─────┐
│In-App │ │Email│ │ SMS │ │ Push  │ │Slack │
│ Bell  │ │     │ │     │ │(PWA)  │ │ (opt)│
└───────┘ └─────┘ └─────┘ └───────┘ └──────┘
```

**Notification Types:**
- Lead assigned to you
- New message received
- Appointment in 1 hour
- Task due today
- Payment received
- Job status changed
- Document signed
- System alerts

**User Preferences:**
- Per-notification-type settings
- Channel preferences (email + push, SMS only, etc.)
- Quiet hours
- Digest options (immediate, hourly, daily)

---

## 📅 Calendar Integration

### Google Calendar Sync

**Features:**
- Two-way sync (CRM ↔ Google)
- Auto-create calendar events for:
  - Appointments
  - Job start/end dates
  - Task deadlines
  - Crew assignments
- Color coding by event type
- Attendee management
- Location (property address)
- Reminders (15min, 1hr, 1day)
- Availability checking

**Implementation:**
```typescript
Google Calendar Flow:
1. OAuth 2.0 authentication
2. Store refresh token encrypted
3. Background sync every 15 minutes
4. Webhook for instant updates
5. Conflict resolution (CRM = source of truth)
```

### Outlook Calendar Sync

**Features:**
- Microsoft Graph API integration
- Same two-way sync capabilities
- Outlook contact sync (optional)
- Teams meeting creation
- Shared calendar support

**Both Integrations Support:**
- Multiple calendar selection
- Conflict detection
- Busy/free status
- Recurring events
- All-day events
- Calendar sharing with team
- Mobile calendar updates

---

## ⚡ Automation Engine

### Visual Workflow Builder

**Drag-and-Drop Interface:**
```
Trigger → Conditions → Actions → Delays → Actions
```

**Triggers:**
- Lead created
- Lead status changed
- Appointment booked/completed
- Job won/lost
- Task completed
- Payment received
- Document signed
- Form submitted
- Time-based (daily, weekly, specific date)
- Inactivity (no contact in X days)

**Conditions:**
- Lead source equals [value]
- Job value greater than $X
- Property in [zip codes]
- Tag includes [tag]
- Custom field matches
- Weather event in area
- Time since last contact

**Actions:**
- Send email (template)
- Send SMS
- Create task
- Update field
- Add tag
- Assign to user
- Create calendar event
- Send internal notification
- Trigger webhook
- Wait for [duration]
- AI: Generate and send message
- AI: Score lead
- AI: Suggest next action

### Pre-Built Automation Templates

**1. New Lead Nurture Sequence:**
```
Day 0: Lead created
  → Send welcome email immediately
  → Assign to sales rep
  → Create "Initial contact" task

Day 1 (if not contacted):
  → SMS: "Did you receive our email?"
  → Notify sales manager

Day 3 (if still not contacted):
  → Email: Special offer
  → SMS with direct phone number

Day 7 (if no response):
  → Mark as "Needs Follow-up"
  → Create high-priority task
```

**2. Appointment Reminder Sequence:**
```
24 hours before:
  → Email confirmation with details
  → SMS reminder

1 hour before:
  → SMS: "Technician on the way"

After completion:
  → SMS: "Thanks for your time!"
  → Create follow-up task for estimate
```

**3. Post-Job Review Request:**
```
Day 1 after completion:
  → SMS: "Thank you! How did we do?"

Day 3 (if no review):
  → Email with Google/Yelp links
  → Offer $50 referral incentive

Day 7 (if no review):
  → Personal call from manager
```

**4. Payment Collection Sequence:**
```
Invoice sent:
  → Email with payment link
  → Add to accounts receivable

7 days overdue:
  → SMS reminder
  → Email with payment options

14 days overdue:
  → Phone call task for AR manager
  → SMS: "Please call to discuss"

30 days overdue:
  → Hold future work
  → Escalate to collections
```

**5. Abandoned Estimate Follow-up:**
```
Day 1 after estimate sent:
  → Email: "Questions about your estimate?"

Day 3 (if not opened):
  → SMS with portal link

Day 7 (if opened but not responded):
  → AI-generated personalized email
  → Offer to schedule call

Day 14:
  → Special limited-time offer
  → Create "closing" task for sales manager
```

---

## 🌐 Client Portal

### Portal Architecture

```
Client Portal URL: https://app.roofingcrm.com/portal/[unique-token]

Each client gets:
├── Unique secure link (UUID-based)
├── Optional password protection
├── Mobile-responsive design
├── No login required (magic link)
└── Expires after job completion + 90 days (configurable)
```

### Portal Features

**1. Overview Dashboard:**
- Project status timeline
- Current phase indicator
- Next scheduled appointment
- Outstanding balance
- Recent activity feed

**2. Documents Section:**
```typescript
Documents:
├── Estimates
│   ├── View online (HTML)
│   ├── Download PDF
│   ├── Accept/Decline
│   └── Request modifications
├── Contracts
│   ├── View terms
│   ├── Electronic signature
│   ├── Download signed copy
│   └── Amendment history
├── Invoices
│   ├── View/download
│   ├── Pay online (Stripe/Square)
│   ├── Payment history
│   └── Set up payment plan
├── Insurance Docs
│   ├── Claim forms
│   ├── Adjuster notes
│   ├── Supplement requests
│   └── Approval letters
└── Other
    ├── Warranty information
    ├── Product specifications
    ├── Permit approvals
    └── HOA approvals
```

**3. Photo Gallery:**
- Before photos
- During (progress updates)
- After completion
- Organized by date/category
- Downloadable albums
- Zoomable high-resolution
- Before/after comparison slider
- Damage documentation (for insurance)

**4. Communication Hub:**
- Message the team
- View conversation history
- Upload files/photos
- Request updates
- Emergency contact button

**5. Estimate Approval Workflow:**
```
1. Client receives link via SMS/email
2. Opens portal (no login needed)
3. Reviews estimate with line items
4. Can:
   a) Accept → Signs electronically → Auto-creates job
   b) Decline → Provide reason → Notify sales
   c) Request changes → Opens chat → Notify sales
   d) Share with spouse → Send additional link
```

**6. Electronic Signature:**
- DocuSign-style interface
- Touch/mouse signature
- Type name option
- Multiple signers support
- PDF with signature overlay
- Audit trail (IP, timestamp, device)
- Legally binding
- Automatic document storage

**7. Payment Portal:**
- View balance breakdown
  - Deposit
  - Progress payments
  - Final payment
  - Outstanding balance
- Pay by credit card (Stripe)
- Pay by ACH/bank transfer
- Save payment method (PCI-compliant)
- Automatic receipt generation
- Payment plan options

**8. Schedule Management:**
- View upcoming appointments
- Request reschedule
- Confirm appointments
- Add to personal calendar
- Weather delay notifications

### Portal Sharing

**Generating Portal Link:**
```typescript
POST /api/portal/generate
{
  jobId: "job-123",
  clientEmail: "client@email.com",
  clientPhone: "+1234567890",
  expiresInDays: 90,
  passwordProtected: false,
  allowedSections: ["documents", "photos", "messages"]
}

Response:
{
  portalUrl: "https://app.roofingcrm.com/portal/abc-123-def-456",
  qrCode: "data:image/png;base64...",
  sharingOptions: {
    email: true,
    sms: true,
    whatsapp: true
  }
}
```

**Sharing Methods:**
- SMS with short link
- Email with branded message
- QR code (for in-person)
- WhatsApp message
- Copy link to clipboard

**Security:**
- Unique non-guessable tokens (UUID v4)
- Rate limiting on access attempts
- IP-based access logging
- Optional password protection
- Optional SMS verification
- Automatic expiration
- Revocable access
- Audit trail of all actions

---

## 📱 Progressive Web App (PWA) Enhancements

### Mobile-First Features

**Offline Capabilities:**
- View cached job data
- Take photos (auto-upload when online)
- Create notes
- Log time
- Update job status
- Offline queue for sync

**Camera Integration:**
- Direct photo capture
- Auto-categorization (before/during/after)
- GPS coordinates embedded
- Timestamp watermark
- Compression for faster upload
- Batch upload

**Push Notifications:**
- Works even when app closed
- Rich notifications (images, actions)
- Action buttons (Accept, Decline, View)
- Notification center
- Badge counts

**Installation:**
- One-tap "Add to Home Screen"
- Full-screen app experience
- Custom app icon
- Splash screen
- Works on iOS and Android

**GPS Features:**
- Check-in/check-out at job sites
- Location-based job reminders
- Crew location tracking (with permission)
- Mileage tracking
- Territory mapping

**Mobile-Optimized UI:**
- Large touch targets
- Swipe gestures
- Bottom navigation
- Thumb-friendly zones
- Voice input
- Barcode/QR scanner

---

## 🔧 Technical Implementation Details

### New Services & Modules

```typescript
Backend Services:
├── apps/api/src/modules/
│   ├── ai/
│   │   ├── ollama.service.ts          # Ollama integration
│   │   ├── ai-router.service.ts       # Model selection
│   │   ├── ai-tools.service.ts        # Tool definitions
│   │   └── voice-ai.service.ts        # Call handling
│   ├── communications/
│   │   ├── sms.service.ts             # Twilio SMS
│   │   ├── email.service.ts           # Email sending
│   │   ├── messaging.service.ts       # Internal chat
│   │   └── notifications.service.ts   # Unified notifications
│   ├── calendar/
│   │   ├── google-calendar.service.ts
│   │   └── outlook-calendar.service.ts
│   ├── automation/
│   │   ├── workflow.service.ts        # Workflow engine
│   │   ├── trigger.service.ts         # Event triggers
│   │   └── action.service.ts          # Action execution
│   ├── portal/
│   │   ├── portal.service.ts          # Portal generation
│   │   ├── portal-auth.service.ts     # Token-based auth
│   │   └── esignature.service.ts      # Electronic signatures
│   └── integrations/
│       ├── twilio.service.ts
│       ├── stripe.service.ts
│       └── storage.service.ts
```

### Database Schema Additions

```prisma
// Voice calls
model Call {
  id            String   @id @default(cuid())
  tenantId      String
  phoneNumber   String
  direction     String   // INBOUND, OUTBOUND
  duration      Int      // seconds
  recording     String?  // URL to recording
  transcription String?  // Full text
  summary       String?  // AI-generated
  sentiment     String?  // POSITIVE, NEUTRAL, NEGATIVE
  leadId        String?
  jobId         String?
  outcome       String?  // APPOINTMENT_BOOKED, VOICEMAIL, etc.
}

// Messages
model Message {
  id           String   @id @default(cuid())
  tenantId     String
  fromUserId   String?
  toUserId     String?
  channelId    String?  // For group messages
  content      String
  messageType  String   // TEXT, IMAGE, FILE, SYSTEM
  attachments  Json[]
  readBy       String[] // User IDs who read it
  createdAt    DateTime @default(now())
}

// Calendar sync
model CalendarSync {
  id            String   @id @default(cuid())
  userId        String
  provider      String   // GOOGLE, OUTLOOK
  calendarId    String
  accessToken   String   @encrypted
  refreshToken  String   @encrypted
  syncEnabled   Boolean  @default(true)
  lastSyncAt    DateTime?
}

// Portal
model ClientPortal {
  id           String    @id @default(cuid())
  tenantId     String
  jobId        String
  token        String    @unique
  password     String?
  expiresAt    DateTime
  accessLog    Json[]
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
}

// Workflow
model Workflow {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  description String?
  trigger     Json     // Trigger configuration
  conditions  Json[]   // Condition rules
  actions     Json[]   // Action steps
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
}

// Workflow execution
model WorkflowExecution {
  id         String   @id @default(cuid())
  workflowId String
  entityType String   // LEAD, JOB, etc.
  entityId   String
  status     String   // PENDING, RUNNING, COMPLETED, FAILED
  startedAt  DateTime
  completedAt DateTime?
  logs       Json[]
}
```

### Environment Variables

```bash
# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=gemma2:27b

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Voice AI
VOICE_AI_PROVIDER=elevenlabs # or deepgram
ELEVENLABS_API_KEY=
DEEPGRAM_API_KEY=

# Email
SENDGRID_API_KEY=
EMAIL_FROM_ADDRESS=
EMAIL_FROM_NAME=

# Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Payments
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Storage
AWS_S3_BUCKET=
AWS_ACCESS_KEY=
AWS_SECRET_KEY=

# Push Notifications
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

---

## 🚀 Implementation Priority

### Phase 2A: AI & Voice (Weeks 1-3)
- ✅ Ollama integration
- ✅ AI tools system
- ✅ Voice AI call handling
- ✅ Call transcription & logging

### Phase 2B: Communications (Weeks 4-6)
- ✅ SMS integration (Twilio)
- ✅ Email system with templates
- ✅ Internal messaging (Socket.io)
- ✅ Unified notifications

### Phase 2C: Calendar & Automation (Weeks 7-9)
- ✅ Google Calendar sync
- ✅ Outlook Calendar sync
- ✅ Automation engine
- ✅ Pre-built workflow templates

### Phase 2D: Client Portal (Weeks 10-11)
- ✅ Portal generation & sharing
- ✅ Document viewing & signing
- ✅ Photo galleries
- ✅ Payment integration

### Phase 2E: PWA Enhancement (Week 12)
- ✅ Offline support
- ✅ Push notifications
- ✅ Camera integration
- ✅ Install prompts

---

## 📊 Success Metrics

**AI Performance:**
- Call booking success rate: >70%
- Average call handling time: <3 minutes
- Transcription accuracy: >95%
- Lead scoring accuracy: >80%

**Communication:**
- SMS open rate: >98%
- Email open rate: >30%
- Response time: <2 hours average
- Message delivery rate: >99%

**Automation:**
- Leads nurtured automatically: 100%
- Appointment no-show rate: <10%
- Follow-up completion: >90%
- Time saved per user: >10 hours/week

**Client Portal:**
- Estimate approval time: <24 hours
- Portal usage rate: >80%
- Payment collection time: -50%
- Client satisfaction: >4.5/5

**PWA:**
- Mobile app usage: >60%
- Offline capability usage: >40%
- Push notification click rate: >50%
- Installation rate: >30%

---

This enhanced plan transforms the CRM into a complete, AI-powered roofing business operating system that handles everything from the first call to final payment, all while providing an exceptional experience for both the roofing company and their clients.
