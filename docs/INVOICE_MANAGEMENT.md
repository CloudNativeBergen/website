# Invoice Management System for Conference Sponsors

This document describes the invoice management system that has been added to the conference sponsorship management platform.

## Overview

The invoice management system allows administrators to track and manage invoicing information for conference sponsors. This includes invoice status, amounts, references, dates, and other relevant invoicing details.

## Features

### 1. Invoice Data Structure

Each sponsor can have associated invoice information with the following fields:

- **Status**: Enum values - `pending`, `sent`, `paid`, `overdue`, `cancelled`, `partial`
- **Date**: Invoice creation/sent date
- **Due Date**: Payment due date
- **Their Reference**: Client's PO number or reference
- **Our Reference**: Our invoice number or reference
- **Amount**: Invoice amount (may differ from tier price due to negotiations)
- **Currency**: Invoice currency (NOK, EUR, USD, GBP)
- **Notes**: Additional invoice notes

### 2. Database Schema

The invoice information is stored in the Sanity CMS as part of the sponsor document:

```typescript
invoice: {
  status?: 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'partial'
  date?: string // ISO date string
  due_date?: string // ISO date string
  their_ref?: string
  our_ref?: string
  amount?: number
  currency?: string
  notes?: string
}
```

### 3. Type System Updates

#### New Types

- `InvoiceInfo`: Interface for invoice data
- `InvoiceFormData`: Interface for invoice form handling
- `INVOICE_STATUS_OPTIONS`: Enum of valid status values
- `ConferenceSponsorDetailed`: Extended sponsor type with invoice data

#### Updated Types

- Extended `SponsorInput` to include optional invoice field
- Updated all admin components to use new extended types

### 4. Admin Interface Features

#### Invoice Overview Dashboard

- Summary cards showing count of sponsors by invoice status
- Color-coded status indicators
- Quick overview of sponsor names by status

#### Sponsor Cards Enhancement

- Invoice status badges on sponsor cards in tier management
- Visual indicators for invoice status alongside contact/billing status

#### Invoice Editor Component

- Modal-based invoice editor with full CRUD capabilities
- Form validation and proper type safety
- Status dropdown with all available statuses
- Date pickers for invoice and due dates
- Currency selection
- Reference fields for both parties
- Notes field for additional information

#### Invoice Management Section

- Dedicated section for managing all sponsor invoices
- Click-to-edit interface for quick invoice updates
- Visual status indicators

### 5. API Endpoints

#### New tRPC Mutation

- `sponsor.updateInvoice`: Updates invoice information for a sponsor
  - Input: `{ id: string, invoice: InvoiceInfo }`
  - Validates sponsor existence
  - Updates only invoice field
  - Returns updated sponsor data

### 6. Integration Points

#### Sponsor Add/Edit Modal

- Extended to include invoice information
- Proper type safety for invoice data
- Form handling for all invoice fields

#### Conference Data Fetching

- Updated Sanity queries to include invoice information
- Backward compatible with existing data

#### Sponsor Management

- All sponsor management functions now support invoice data
- CRUD operations maintain invoice information integrity

## Usage

### Accessing Invoice Management

1. Navigate to `/admin/sponsors`
2. View the "Invoice Overview" section for status summary
3. Use the "Invoice Management" section to edit individual invoices
4. Click on any sponsor card to open the invoice editor

### Updating Invoice Status

1. Click on a sponsor in the Invoice Management section
2. Modify the desired fields in the invoice editor
3. Save changes with the "Save Invoice" button
4. Status updates are reflected immediately in the overview

### Adding Invoice Information to New Sponsors

1. Use the regular sponsor add/edit workflow
2. Invoice fields are optional and can be filled during sponsor creation
3. Can be added or updated at any time after sponsor creation

## Technical Implementation

### Database Migration

The system is designed to be backward compatible. Existing sponsors without invoice information will:

- Show "pending" status by default
- Allow adding invoice information without data migration
- Maintain all existing functionality

### Error Handling

- Proper validation of invoice status values
- Date validation for invoice and due dates
- Currency validation
- Graceful handling of missing invoice data

### Performance Considerations

- Invoice data is fetched alongside sponsor data
- No additional API calls required for basic invoice display
- Efficient querying through Sanity CMS

## Future Enhancements

Potential areas for expansion include:

1. **Invoice Generation**: Automatic PDF generation from invoice data
2. **Payment Tracking**: Integration with payment processing systems
3. **Reminder System**: Automated reminders for overdue invoices
4. **Reporting**: Advanced invoice reporting and analytics
5. **Bulk Operations**: Bulk status updates for multiple sponsors
6. **Invoice Templates**: Customizable invoice templates
7. **Currency Conversion**: Automatic currency conversion for international sponsors

## Security

- All invoice operations require admin authentication
- Data validation at both client and server levels
- Proper sanitization of input data
- Role-based access control (admin/editor only)

## Testing

The system includes:

- Type safety throughout the stack
- Proper error handling and user feedback
- Backward compatibility with existing data
- Form validation and user experience considerations

## Conclusion

This invoice management system provides a comprehensive solution for tracking sponsor invoice information while maintaining the existing workflow and user experience. The implementation is type-safe, scalable, and ready for future enhancements.
