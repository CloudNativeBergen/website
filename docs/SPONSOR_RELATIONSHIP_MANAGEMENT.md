# Sponsor Relationship Management

## Overview

The sponsor relationship management system has been reorganized to provide a better user experience and cleaner separation of concerns.

## Page Structure

### Main Sponsor Page (`/admin/sponsors`)

**Purpose**: Clean overview of sponsors and basic management tasks

**Features**:

- Sponsor list grouped by tiers
- Sponsorship summary statistics
- Basic sponsor communications
- Sponsor tier management
- Quick action links

**Removed from main page**:

- Invoice management (moved to relationships page)
- Detailed invoice overview (moved to relationships page)
- Billing relationship tracking (moved to relationships page)

### Sponsor Relationship Management (`/admin/sponsors/relationships`)

**Purpose**: Comprehensive CRM-style interface for managing sponsor relationships

**Features**:

- **Sponsor Selector**: Search and filter sponsors by status
- **Relationship Overview**: Contact info, billing, basic details
- **Invoice & Billing**: Integrated invoice management with InvoiceEditor component
- **Contract Management**: Contract details, terms, deliverables (placeholder)
- **Communications**: Communication history and logging (placeholder)
- **Timeline**: Status history and relationship progression (placeholder)

**Design Philosophy**:

- CRM-like experience with sponsor selector sidebar
- Tabbed interface for different relationship aspects
- Focus on the complete sponsor journey and lifecycle
- Centralized location for all relationship-related tasks

## Component Architecture

### SponsorRelationshipManager

**Location**: `/components/admin/SponsorRelationshipManager.tsx`

**Structure**:

- Main container with sidebar and content areas
- Sponsor list with search/filter capabilities
- Tab-based content area with:
  - Overview tab (implemented)
  - Contract tab (placeholder)
  - Communications tab (placeholder)
  - Timeline tab (placeholder)

**Current Implementation**:

- ✅ Sponsor selection with search and status filtering
- ✅ Overview tab with contact and billing information
- ✅ Status display with proper color coding
- 🔄 Contract management (placeholder)
- 🔄 Communication history (placeholder)
- 🔄 Status timeline (placeholder)

## Navigation

- **Main sponsors page** includes "Relationship Management" quick action
- **Relationships page** includes breadcrumb back to main sponsors page
- Clean separation allows focused workflows

## Future Enhancements

1. **Contract Management**:
   - Contract upload and storage
   - Terms and conditions tracking
   - Deliverables checklist
   - Contract status workflow

2. **Communication History**:
   - Email/call/meeting logging
   - Attachment support
   - Follow-up reminders
   - Communication templates

3. **Status Timeline**:
   - Visual timeline of relationship progression
   - Status change history with notes
   - Automated status transitions
   - Milestone tracking

4. **Advanced Features**:
   - Sponsor scoring and priority management
   - Automated follow-up workflows
   - Integration with external CRM systems
   - Reporting and analytics

## Usage

1. **Access**: Navigate to `/admin/sponsors/relationships`
2. **Select Sponsor**: Use search or filter to find sponsor in sidebar
3. **Manage**: Use tabs to access different aspects of the relationship
4. **Update**: Use action buttons to update status, log communications, etc.

This structure provides a solid foundation for comprehensive sponsor relationship management while maintaining clean separation of basic sponsor management and detailed relationship tracking.
