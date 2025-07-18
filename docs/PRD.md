# Product Requirements Document (PRD)
## Cloud Native Bergen Conference Management System

### Version: 1.1
### Date: January 2025
### Status: Active
### Last Updated: January 2025 - Added co-speaker support

---

## 1. Executive Summary

The Cloud Native Bergen Conference Management System is a comprehensive web platform designed to manage technology conferences, with a primary focus on Cloud Native Bergen and Cloud Native Day Bergen events. The system provides an integrated solution for conference organizers, speakers, sponsors, and attendees, covering the entire conference lifecycle from Call for Papers (CFP) through event execution.

### Key Value Propositions
- **Streamlined CFP Process**: Automated proposal submission, review, and management
- **Integrated Content Management**: Centralized management of speakers, talks, schedules, and sponsors
- **Real-time Conference Website**: Dynamic public-facing website with up-to-date information
- **Multi-stakeholder Support**: Tailored experiences for organizers, speakers, sponsors, and attendees
- **Scalable Architecture**: Built on modern cloud-native technologies

---

## 2. Product Overview

### 2.1 Vision Statement
To provide a best-in-class conference management platform that simplifies the organization of technology conferences while delivering exceptional experiences for all stakeholders.

### 2.2 Target Users
1. **Conference Organizers**: Event planners and committee members
2. **Speakers**: Presenters submitting and managing proposals
3. **Reviewers**: Committee members evaluating proposals
4. **Sponsors**: Companies sponsoring the event
5. **Attendees**: Conference participants seeking information and registration

### 2.3 Core Problems Solved
- Manual and fragmented conference organization processes
- Inefficient proposal submission and review workflows
- Lack of real-time information updates for attendees
- Difficulty in managing speaker communications
- Complex sponsor relationship management
- Inconsistent branding and content across conference materials

---

## 3. Product Features

### 3.1 Conference Management

#### 3.1.1 Conference Configuration
- **Multi-conference Support**: Manage multiple conference instances
- **Basic Information**: Title, organizer, location (city, country, venue)
- **Key Dates**: Conference dates, CFP timeline, notification dates
- **Branding**: Tagline, description, announcement messages
- **Metrics Dashboard**: Display vanity metrics (attendees, speakers, etc.)
- **Domain Management**: Support for multiple domains per conference

#### 3.1.2 Content Management (via Sanity CMS)
- **Speakers**: Profile management with bio, image, links, and metadata
- **Talks/Proposals**: Full proposal lifecycle management
- **Sponsors**: Sponsor information with tier-based categorization
- **Topics**: Categorization system for talks and sessions
- **Schedule**: Multi-track schedule management with time slots

### 3.2 Call for Papers (CFP) System

#### 3.2.1 Proposal Submission
- **Authentication**: GitHub-based authentication for speakers
- **Proposal Form**:
  - Title and description (rich text editor)
  - Language selection (Norwegian/English)
  - Format options (lightning talks, presentations, workshops)
  - Difficulty level (beginner/intermediate/advanced)
  - Target audience specification
  - Topic selection
  - Terms of Service acceptance
- **Co-Speaker Support**:
  - Available for all formats except 10-minute lightning talks
  - Co-speakers must authenticate via GitHub
  - Required co-speaker information:
    - Name, title, email
    - Biography and profile image
    - Social/professional links
    - Authentication provider tracking
    - Speaker flags (local, first-time, diverse, travel funding)
  - Co-speakers receive same notifications as primary speaker
  - Co-speakers can view proposal status but cannot edit
- **Draft Management**: Save and edit proposals before submission

#### 3.2.2 Proposal States
- **Draft**: Initial creation state
- **Submitted**: Formally submitted for review
- **Accepted**: Approved by organizers
- **Rejected**: Not selected
- **Confirmed**: Speaker has confirmed participation (requires all speakers to confirm)
- **Withdrawn**: Speaker has withdrawn proposal
- **Deleted**: Removed from system

#### 3.2.3 Co-Speaker Management
- **Invitation Process**: Primary speaker invites co-speakers via email
- **Acceptance Flow**: Co-speakers must accept invitation and authenticate
- **Profile Creation**: Automatic profile generation from GitHub if new speaker
- **Permissions**:
  - Primary speaker: Full edit rights on proposal
  - Co-speakers: View-only access to proposal
  - All speakers: Receive status notifications
- **Validation Rules**:
  - Maximum 3 co-speakers per proposal
  - Co-speakers cannot be added to lightning talks (10 min)
  - All speakers must accept Terms of Service
  - Duplicate speakers not allowed on same proposal

### 3.3 Review System

#### 3.3.1 Review Workflow
- **Reviewer Assignment**: Reference reviewers from speaker profiles
- **Scoring System**:
  - Content quality (0-10)
  - Relevance (0-10)
  - Speaker presentation skills (0-10)
- **Comments**: Text feedback for internal use
- **Bulk Review**: Navigate through unreviewed proposals
- **Co-Speaker Visibility**: Reviewers see all speakers associated with proposal

#### 3.3.2 Review Features
- **Search Functionality**: Find proposals by keywords
- **Filter Options**: By status, format, topics
- **Sort Capabilities**: By submission date, score, etc.
- **Quick Navigation**: "Next unreviewed" functionality

### 3.4 Speaker Management

#### 3.4.1 Speaker Profiles
- **Basic Information**: Name, title, email
- **Professional Details**: Biography, profile image
- **Social Links**: Multiple social media/professional links
- **Authentication Providers**: Track login methods
- **Special Flags**:
  - Local speaker
  - First-time speaker
  - Diverse speaker
  - Requires travel funding

#### 3.4.2 Speaker Features
- **Slug-based URLs**: SEO-friendly speaker pages
- **Featured Speakers**: Highlight key speakers
- **Organizer Flag**: Identify conference organizers
- **Submission History**: View past proposals
- **Co-Speaker History**: Display proposals where speaker was co-presenter
- **Collaboration Network**: Track frequent co-speaker relationships

### 3.5 Schedule Management

#### 3.5.1 Schedule Structure
- **Multi-day Support**: Handle conferences spanning multiple days
- **Track Management**: Multiple parallel tracks
- **Time Slots**: Flexible time slot configuration
- **Talk Assignment**: Link accepted talks to schedule slots

#### 3.5.2 Schedule Features
- **Visual Schedule**: Grid-based schedule display
- **Speaker Integration**: Automatic speaker information display
- **Co-Speaker Display**: Show all speakers for multi-speaker sessions
- **Real-time Updates**: Changes reflect immediately on website

### 3.6 Sponsor Management

#### 3.6.1 Sponsor Tiers
- **Configurable Tiers**: Create custom sponsorship levels
- **Tier Benefits**: Define benefits per tier
- **Display Order**: Control sponsor visibility

#### 3.6.2 Sponsor Information
- **Company Details**: Name, website, logo (SVG format)
- **Tier Assignment**: Link sponsors to appropriate tiers
- **Conference Association**: Sponsors linked to specific conferences

### 3.7 Public Website

#### 3.7.1 Landing Page
- **Hero Section**: Conference branding and key information
- **Call-to-Action**: Registration and CFP buttons
- **Vanity Metrics**: Display key statistics
- **Announcement Banner**: Important updates

#### 3.7.2 Content Pages
- **Program/Schedule**: Interactive schedule display
- **Speakers**: Featured speaker showcase
- **Sponsors**: Tiered sponsor display
- **Code of Conduct**: Conference policies
- **Venue Information**: Location and logistics

#### 3.7.3 Dynamic Features
- **Registration Integration**: Link to external ticketing
- **Social Media Integration**: Bluesky feed support
- **OpenGraph Support**: Social media preview optimization

### 3.8 Administrative Dashboard

#### 3.8.1 Core Sections
- **Proposals**: Review and manage submissions
- **Speakers**: Speaker profile management
- **Schedule**: Build and modify conference schedule
- **Sponsors**: Manage sponsor relationships
- **Settings**: Conference configuration
- **Tickets**: Integration with ticketing system

#### 3.8.2 Administrative Features
- **Bulk Actions**: Process multiple items
- **Export Capabilities**: Data export for reporting
- **Notification System**: Email and Slack integrations
- **Access Control**: Role-based permissions

---

## 4. Technical Architecture

### 4.1 Technology Stack
- **Frontend Framework**: Next.js 15 with React 19
- **Styling**: Tailwind CSS v4
- **Content Management**: Sanity CMS
- **Authentication**: NextAuth.js (Auth.js)
- **Database**: Sanity backend
- **Deployment**: Optimized for Vercel
- **Language**: TypeScript

### 4.2 Key Dependencies
- **UI Components**: Headless UI, Heroicons
- **Rich Text**: Portable Text (Sanity)
- **Analytics**: Vercel Analytics & Speed Insights
- **Email**: SendGrid integration
- **Image Processing**: Sharp, Sanity Image URL
- **QR Codes**: QRCode generation

### 4.3 Architecture Patterns
- **App Router**: Next.js 13+ app directory structure
- **Server Components**: Optimized server-side rendering
- **API Routes**: RESTful API endpoints
- **Type Safety**: Comprehensive TypeScript types
- **Modular Structure**: Feature-based organization

### 4.4 Data Model Enhancements
- **Speaker Relations**: Support for multiple speakers per proposal
- **Invitation System**: Track co-speaker invitations and acceptances
- **Permission Model**: Differentiate primary and co-speaker rights
- **Notification Queue**: Handle multi-recipient notifications

### 4.5 Development Standards
- **Code Quality**: ESLint, Prettier configuration
- **Testing**: Jest with React Testing Library
- **Type Checking**: Strict TypeScript configuration
- **Version Control**: Git with semantic versioning
- **Documentation**: Inline documentation and README files

---

## 5. User Workflows

### 5.1 Speaker Workflow

#### 5.1.1 Primary Speaker Workflow
1. **Authentication**: Sign in via GitHub
2. **Profile Creation**: Auto-populate from GitHub
3. **Proposal Creation**: Create talk proposal
4. **Co-Speaker Invitation**: Add co-speakers (except for lightning talks)
5. **Proposal Submission**: Submit completed proposal
6. **Status Tracking**: Monitor proposal status
7. **Confirmation**: Confirm accepted talks
8. **Profile Updates**: Maintain speaker information

#### 5.1.2 Co-Speaker Workflow
1. **Invitation Receipt**: Receive email invitation to join proposal
2. **Authentication**: Sign in via GitHub
3. **Profile Creation**: Auto-populate from GitHub if new speaker
4. **Invitation Acceptance**: Accept co-speaker invitation
5. **Proposal Viewing**: Access read-only view of proposal
6. **Status Tracking**: Receive notifications on proposal status
7. **Confirmation**: Confirm participation if proposal accepted
8. **Profile Management**: Maintain own speaker profile

### 5.2 Organizer Workflow
1. **Conference Setup**: Configure conference details
2. **CFP Management**: Open/close submission periods
3. **Review Process**: Evaluate and score proposals
4. **Communication**: Notify speakers of decisions
5. **Schedule Building**: Create conference agenda
6. **Content Publishing**: Update website content

### 5.3 Attendee Workflow
1. **Information Discovery**: Browse conference website
2. **Schedule Review**: View session details
3. **Speaker Research**: Explore speaker profiles
4. **Registration**: Link to ticketing system
5. **Event Participation**: Access venue information

---

## 6. Integration Points

### 6.1 External Services
- **GitHub**: OAuth authentication for all speakers
- **SendGrid**: Email notifications including co-speaker invitations
- **Slack**: Internal notifications for proposal submissions
- **Checkin.no**: Ticketing integration
- **Bluesky**: Social media feed

### 6.2 Data Migration
- **Migration Framework**: Sanity migration tools
- **Schema Evolution**: Versioned schema changes
- **Data Validation**: Pre-migration validation

### 6.3 Business Rules for Co-Speakers
- **Format Restrictions**:
  - Lightning talks (10 min): No co-speakers allowed
  - Presentations (20-45 min): Up to 3 co-speakers
  - Workshops (2-4 hours): Up to 3 co-speakers
- **Authentication Requirements**:
  - All speakers must authenticate via GitHub
  - Co-speakers must have verified email addresses
- **Confirmation Process**:
  - All speakers must individually confirm participation
  - Proposal marked confirmed only when all speakers confirm
  - 7-day deadline for co-speaker confirmation
- **Communication Rules**:
  - All status changes notify all speakers
  - Rejection/acceptance emails sent to all speakers
  - Reminder emails sent individually

---

## 7. Non-Functional Requirements

### 7.1 Performance
- **Page Load**: < 3 seconds on 3G networks
- **API Response**: < 500ms for standard queries
- **Concurrent Users**: Support 1000+ simultaneous users
- **CDN Integration**: Global content delivery

### 7.2 Security
- **Authentication**: OAuth 2.0 with GitHub
- **Authorization**: Role-based access control
- **Data Protection**: HTTPS everywhere
- **Input Validation**: Server-side validation
- **XSS Prevention**: Sanitized user inputs

### 7.3 Accessibility
- **WCAG Compliance**: Level AA compliance
- **Keyboard Navigation**: Full keyboard support
- **Screen Readers**: ARIA labels and landmarks
- **Color Contrast**: Accessible color schemes

### 7.4 Scalability
- **Horizontal Scaling**: Stateless architecture
- **Database**: Sanity's scalable backend
- **Caching**: Strategic caching implementation
- **CDN**: Static asset optimization

---

## 8. Success Metrics

### 8.1 Business Metrics
- **CFP Submissions**: Number of quality proposals
- **Speaker Diversity**: Geographic and demographic variety
- **Sponsor Satisfaction**: Retention rate
- **Attendee Growth**: Year-over-year increase

### 8.2 Technical Metrics
- **Uptime**: 99.9% availability
- **Performance**: Core Web Vitals compliance
- **Error Rate**: < 0.1% of requests
- **User Satisfaction**: > 4.5/5 rating

### 8.3 User Experience Metrics
- **Submission Completion**: > 80% completion rate
- **Time to Submit**: < 15 minutes average
- **Support Tickets**: < 5% of users need support
- **Mobile Usage**: > 40% mobile traffic

---

## 9. Future Enhancements

### 9.1 Phase 2 Features
- **Mobile App**: Native mobile applications
- **Video Integration**: Recorded session management
- **Networking**: Attendee connection features
- **Advanced Analytics**: Detailed conference insights
- **Multi-language**: Full internationalization

### 9.2 Phase 3 Features
- **AI-Powered Matching**: Smart session recommendations
- **Virtual Events**: Hybrid conference support
- **Sponsorship Portal**: Self-service sponsor management
- **Community Platform**: Year-round engagement

---

## 10. Risks and Mitigation

### 10.1 Technical Risks
- **Scalability Issues**: Mitigated by cloud-native architecture
- **Data Loss**: Regular backups and migration testing
- **Security Breaches**: Regular security audits

### 10.2 Business Risks
- **User Adoption**: Intuitive UI and documentation
- **Competition**: Continuous feature enhancement
- **Cost Overruns**: Phased development approach

---

## 11. Maintenance and Support

### 11.1 Ongoing Maintenance
- **Security Updates**: Monthly security patches
- **Feature Updates**: Quarterly feature releases
- **Bug Fixes**: Continuous bug resolution
- **Performance Monitoring**: Real-time monitoring

### 11.2 Support Structure
- **Documentation**: Comprehensive user guides
- **Training**: Organizer training sessions
- **Help Desk**: Email support system
- **Community**: User community forum

---

## 12. Conclusion

The Cloud Native Bergen Conference Management System represents a comprehensive solution for modern conference organization. By combining robust technical architecture with user-centered design, the platform delivers value to all stakeholders while maintaining flexibility for future growth. The modular architecture and cloud-native approach ensure the system can evolve with changing conference needs and technological advances.