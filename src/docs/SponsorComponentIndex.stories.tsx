import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Admin/Sponsors/Component Index',
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const ComponentCard = ({
  name,
  path,
  description,
  hasStory,
}: {
  name: string
  path: string
  description: string
  hasStory?: boolean
}) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-start justify-between">
      <h4 className="font-jetbrains text-sm font-semibold text-gray-900 dark:text-white">
        {name}
      </h4>
      {hasStory && (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Has Story
        </span>
      )}
    </div>
    <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-500">
      {path}
    </p>
    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
      {description}
    </p>
  </div>
)

export const Documentation: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 font-space-grotesk text-3xl font-bold text-gray-900 dark:text-white">
          Sponsor Components
        </h1>
        <p className="mb-8 text-gray-600 dark:text-gray-400">
          Complete list of all sponsor-related components organized by category.
        </p>

        {/* Public Display Components */}
        <section className="mb-12">
          <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            Public Display Components
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Components used on public-facing pages to display sponsor
            information.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <ComponentCard
              name="SponsorLogo"
              path="@/components/SponsorLogo"
              description="Renders SVG sponsor logos with automatic light/dark variant switching."
              hasStory
            />
            <ComponentCard
              name="Sponsors"
              path="@/components/Sponsors"
              description="Displays sponsors grouped by tier on public pages."
              hasStory
            />
            <ComponentCard
              name="SponsorThankYou"
              path="@/components/SponsorThankYou"
              description="Full-width thank you section with all sponsors displayed by tier."
              hasStory
            />
          </div>
        </section>

        {/* Dashboard Components */}
        <section className="mb-12">
          <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            Dashboard Components
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Components used on the main sponsor admin dashboard.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <ComponentCard
              name="SponsorDashboardMetrics"
              path="@/components/admin/sponsor/SponsorDashboardMetrics"
              description="Dashboard metric cards showing revenue, deals, tier utilization, and invoices."
              hasStory
            />
            <ComponentCard
              name="SponsorActionItems"
              path="@/components/admin/sponsor/SponsorActionItems"
              description="List of urgent action items requiring organizer attention."
              hasStory
            />
            <ComponentCard
              name="SponsorActivityTimeline"
              path="@/components/admin/sponsor/SponsorActivityTimeline"
              description="Chronological feed of sponsor activities grouped by day."
              hasStory
            />
          </div>
        </section>

        {/* CRM Pipeline Components */}
        <section className="mb-12">
          <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            CRM Pipeline Components
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Components for the Kanban-style sponsor CRM pipeline.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <ComponentCard
              name="SponsorCRMPipeline"
              path="@/components/admin/sponsor-crm/SponsorCRMPipeline"
              description="Main Kanban board with columns for each pipeline stage."
              hasStory
            />
            <ComponentCard
              name="SponsorBoardColumn"
              path="@/components/admin/sponsor-crm/SponsorBoardColumn"
              description="Individual column in the Kanban board with header and card list."
              hasStory
            />
            <ComponentCard
              name="SponsorCard"
              path="@/components/admin/sponsor-crm/SponsorCard"
              description="Card representing a sponsor in the pipeline with quick actions."
              hasStory
            />
            <ComponentCard
              name="BoardViewSwitcher"
              path="@/components/admin/sponsor-crm/BoardViewSwitcher"
              description="Toggle between different board view modes."
              hasStory
            />
            <ComponentCard
              name="SponsorBulkActions"
              path="@/components/admin/sponsor-crm/SponsorBulkActions"
              description="Toolbar for bulk operations on selected sponsors."
              hasStory
            />
            <ComponentCard
              name="MobileFilterSheet"
              path="@/components/admin/sponsor-crm/MobileFilterSheet"
              description="Bottom sheet filter panel for mobile devices."
              hasStory
            />
          </div>
        </section>

        {/* Form Components */}
        <section className="mb-12">
          <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            Form Components
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Specialized form inputs for sponsor data entry.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ComponentCard
              name="SponsorCRMForm"
              path="@/components/admin/sponsor-crm/SponsorCRMForm"
              description="Main edit modal for sponsor pipeline entries with all fields."
              hasStory
            />
            <ComponentCard
              name="StatusListbox"
              path="@/components/admin/sponsor-crm/form/StatusListbox"
              description="Dropdown for selecting pipeline/contract/invoice status."
              hasStory
            />
            <ComponentCard
              name="TierRadioGroup"
              path="@/components/admin/sponsor-crm/form/TierRadioGroup"
              description="Radio button group for selecting sponsor tier."
              hasStory
            />
            <ComponentCard
              name="AddonsCheckboxGroup"
              path="@/components/admin/sponsor-crm/form/AddonsCheckboxGroup"
              description="Checkbox group for selecting add-on packages."
              hasStory
            />
            <ComponentCard
              name="TagCombobox"
              path="@/components/admin/sponsor-crm/form/TagCombobox"
              description="Multi-select combobox for sponsor tags."
              hasStory
            />
            <ComponentCard
              name="ContractValueInput"
              path="@/components/admin/sponsor-crm/form/ContractValueInput"
              description="Currency input with dropdown for contract value."
              hasStory
            />
            <ComponentCard
              name="SponsorCombobox"
              path="@/components/admin/sponsor-crm/form/SponsorCombobox"
              description="Searchable dropdown for selecting existing sponsors."
              hasStory
            />
            <ComponentCard
              name="OrganizerCombobox"
              path="@/components/admin/sponsor-crm/form/OrganizerCombobox"
              description="Dropdown for assigning sponsors to organizers."
              hasStory
            />
          </div>
        </section>

        {/* Contact Management */}
        <section className="mb-12">
          <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            Contact Management
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Components for managing sponsor contacts and billing information.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <ComponentCard
              name="SponsorContactEditor"
              path="@/components/admin/sponsor/SponsorContactEditor"
              description="Form for managing multiple contact persons and billing info."
              hasStory
            />
            <ComponentCard
              name="SponsorContactTable"
              path="@/components/admin/sponsor/SponsorContactTable"
              description="Table view of all sponsor contacts with inline editing."
              hasStory
            />
            <ComponentCard
              name="SponsorContactActions"
              path="@/components/admin/sponsor/SponsorContactActions"
              description="Action bar with export and broadcast buttons."
              hasStory
            />
          </div>
        </section>

        {/* Email & Communication */}
        <section className="mb-12">
          <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            Email &amp; Communication
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Components for sponsor email communication and templates.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <ComponentCard
              name="SponsorIndividualEmailModal"
              path="@/components/admin/sponsor/SponsorIndividualEmailModal"
              description="Email composition modal with template selection and preview."
              hasStory
            />
            <ComponentCard
              name="SponsorTemplatePicker"
              path="@/components/admin/sponsor/SponsorTemplatePicker"
              description="Dropdown for selecting and applying email templates."
            />
            <ComponentCard
              name="SponsorEmailTemplateEditor"
              path="@/components/admin/sponsor/SponsorEmailTemplateEditor"
              description="Full editor for creating/editing email templates."
            />
            <ComponentCard
              name="SponsorDiscountEmailModal"
              path="@/components/admin/sponsor/SponsorDiscountEmailModal"
              description="Specialized modal for sending discount code emails."
            />
          </div>
        </section>

        {/* Tier Management */}
        <section className="mb-12">
          <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            Tier Management
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Components for managing sponsor tiers and assignments.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <ComponentCard
              name="SponsorTierManagement"
              path="@/components/admin/sponsor/SponsorTierManagement"
              description="Display and manage sponsors grouped by tier with add/edit/remove."
              hasStory
            />
            <ComponentCard
              name="SponsorTierEditor"
              path="@/components/admin/sponsor/SponsorTierEditor"
              description="Form for creating and editing sponsor tier definitions."
              hasStory
            />
            <ComponentCard
              name="SponsorAddModal"
              path="@/components/admin/sponsor/SponsorAddModal"
              description="Modal for adding sponsors to a specific tier."
              hasStory
            />
          </div>
        </section>

        {/* Onboarding & Contract */}
        <section className="mb-12">
          <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            Onboarding &amp; Contract
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Components for sponsor onboarding and contract management.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <ComponentCard
              name="OnboardingLinkButton"
              path="@/components/admin/sponsor-crm/OnboardingLinkButton"
              description="Button to generate and copy onboarding portal links."
              hasStory
            />
            <ComponentCard
              name="ContractReadinessIndicator"
              path="@/components/admin/sponsor-crm/ContractReadinessIndicator"
              description="Shows missing data required before contract can be generated."
              hasStory
            />
            <ComponentCard
              name="SponsorLogoEditor"
              path="@/components/admin/sponsor/SponsorLogoEditor"
              description="SVG logo upload and preview with light/dark variant support."
              hasStory
            />
          </div>
        </section>

        {/* Utility Components */}
        <section>
          <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            Utility Components
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Helper components and utilities used across the sponsor system.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <ComponentCard
              name="ImportHistoricSponsorsButton"
              path="@/components/admin/sponsor-crm/ImportHistoricSponsorsButton"
              description="Button to import sponsors from previous conferences."
              hasStory
            />
            <ComponentCard
              name="ContactRoleSelect"
              path="@/components/common/ContactRoleSelect"
              description="Reusable dropdown for selecting contact person roles."
              hasStory
            />
          </div>
        </section>
      </div>
    </div>
  ),
}
