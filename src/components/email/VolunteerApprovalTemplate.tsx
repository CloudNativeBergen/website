import React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

interface VolunteerApprovalTemplateProps {
  volunteerName: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  message: string
  socialLinks: string[]
}

export const VolunteerApprovalTemplate: React.FC<VolunteerApprovalTemplateProps> = ({
  volunteerName,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  message,
  socialLinks,
}) => {
  return (
    <BaseEmailTemplate
      title={`Welcome to the ${eventName} Volunteer Team!`}
      titleColor="#1D4ED8"
      speakerName={volunteerName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
    >
      <EmailText>
        Congratulations! Your volunteer application has been approved.
      </EmailText>

      {message && (
        <EmailSection backgroundColor="#E0F2FE" borderColor="#CBD5E1" borderLeftColor="#1D4ED8">
          <EmailText>{message}</EmailText>
        </EmailSection>
      )}

      <EmailSectionHeader>Next Steps</EmailSectionHeader>
      <EmailText>
        • Check your email regularly for further instructions and updates
      </EmailText>
      <EmailText>
        • Contact the organizers if you have any questions or concerns
      </EmailText>
      <EmailText>
        • Please arrive on time on the event day
      </EmailText>

      <EmailText>
        Thank you for volunteering to help make {eventName} a success! We look forward to working with you.
      </EmailText>

      <EmailButton href={eventUrl}>
        Visit Event Website
      </EmailButton>
    </BaseEmailTemplate>
  )
}