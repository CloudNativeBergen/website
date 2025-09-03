import { Button } from '@/components/Button'
import {
  ArrowRightIcon,
  CalendarIcon,
  UserGroupIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon } from '@heroicons/react/24/solid'

export function ButtonShowcase() {
  return (
    <div className="space-y-12">
      {/* Primary Action Buttons */}
      <div>
        <h3 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
          Primary Action Buttons
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-3">
            <Button href="#" variant="primary" className="w-full">
              Get Your Ticket
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
              Primary CTA - Cloud Blue
            </p>
          </div>

          <div className="space-y-3">
            <Button href="#" variant="success" className="w-full">
              <UserGroupIcon className="mr-2 h-5 w-5" />
              Become a Sponsor
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
              Sponsorship - Fresh Green
            </p>
          </div>

          <div className="space-y-3">
            <Button href="#" variant="warning" className="w-full">
              <DocumentTextIcon className="mr-2 h-5 w-5" />
              Submit to Speak
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
              Call for Papers - Sunbeam Yellow
            </p>
          </div>
        </div>
      </div>

      {/* Secondary Action Buttons */}
      <div>
        <h3 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
          Secondary Action Buttons
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-3">
            <Button href="#" variant="secondary" className="w-full">
              <CalendarIcon className="mr-2 h-5 w-5" />
              View Program
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
              Program/Schedule - Nordic Purple
            </p>
          </div>

          <div className="space-y-3">
            <Button href="#" variant="outline" className="w-full">
              Learn More
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
              Secondary outline - Cloud Blue
            </p>
          </div>

          <div className="space-y-3">
            <Button href="#" variant="info" className="w-full">
              <ArrowRightIcon className="mr-2 h-5 w-5" />
              Practical Info
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray">
              Informational - Slate Gray
            </p>
          </div>
        </div>
      </div>

      {/* State Variations */}
      <div>
        <h3 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue">
          Button States & Variations
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Button href="#" variant="primary" className="w-full">
              Normal State
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray">
              Default hover effect
            </p>
          </div>

          <div className="space-y-3">
            <Button variant="primary" className="w-full" disabled>
              Disabled State
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray">
              50% opacity when disabled
            </p>
          </div>

          <div className="space-y-3">
            <Button href="#" variant="success" className="w-full">
              <CheckCircleIcon className="mr-2 h-5 w-5" />
              With Icon
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray">
              Icon on the left
            </p>
          </div>

          <div className="space-y-3">
            <Button href="#" variant="primary" className="w-full">
              Action
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Button>
            <p className="font-inter text-sm text-brand-slate-gray">
              Icon on the right
            </p>
          </div>
        </div>
      </div>

      {/* Size Variations */}
      <div>
        <h3 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue">
          Size Variations
        </h3>
        <div className="space-y-4">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Button href="#" variant="primary" size="lg">
                Large Button
              </Button>
            </div>
            <p className="font-inter text-sm text-brand-slate-gray">
              px-6 py-4 text-lg - For hero sections
            </p>
          </div>

          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Button href="#" variant="primary" size="md">
                Default Button
              </Button>
            </div>
            <p className="font-inter text-sm text-brand-slate-gray">
              px-4 py-3 text-base - Standard size
            </p>
          </div>

          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Button href="#" variant="primary" size="sm">
                Small Button
              </Button>
            </div>
            <p className="font-inter text-sm text-brand-slate-gray">
              px-3 py-2 text-sm - For compact areas
            </p>
          </div>
        </div>
      </div>

      {/* Usage Guidelines */}
      <div className="rounded-lg border border-brand-cloud-blue/20 bg-brand-sky-mist p-6">
        <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
          Interactive Demo - Hover Over These Buttons
        </h3>
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Button variant="primary" className="w-full">
            Hover for Color Change
          </Button>
          <Button variant="success" className="w-full">
            Try Hovering Here
          </Button>
          <Button variant="outline" className="w-full">
            Outline Hover Demo
          </Button>
        </div>
        <p className="font-inter text-center text-sm text-brand-slate-gray">
          Notice the smooth color transitions to darker shades on hover
        </p>
      </div>

      {/* Usage Guidelines */}
      <div className="rounded-lg border border-brand-cloud-blue/20 bg-brand-sky-mist p-6">
        <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
          Button Usage Guidelines
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h4 className="font-space-grotesk mb-2 font-medium text-brand-slate-gray">
              Button Variants
            </h4>
            <ul className="font-inter space-y-1 text-sm text-brand-slate-gray">
              <li>
                • <strong>Primary:</strong> Main actions (tickets, registration)
                - Cloud Blue
              </li>
              <li>
                • <strong>Success:</strong> Positive actions (sponsorship) -
                Fresh Green
              </li>
              <li>
                • <strong>Warning:</strong> Important CTAs (call for papers) -
                Sunbeam Yellow
              </li>
              <li>
                • <strong>Secondary:</strong> Secondary actions (program) -
                Nordic Purple
              </li>
              <li>
                • <strong>Info:</strong> Neutral actions (information) - Slate
                Gray
              </li>
              <li>
                • <strong>Outline:</strong> Secondary outline style - Cloud Blue
                border
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-space-grotesk mb-2 font-medium text-brand-slate-gray">
              Hover & Interaction Effects
            </h4>
            <ul className="font-inter space-y-1 text-sm text-brand-slate-gray">
              <li>• Clean color transitions on hover (darker shades)</li>
              <li>• Smooth transitions with 200ms duration</li>
              <li>• Active state scales down (0.95x) for click feedback</li>
              <li>• Outline buttons have inset borders (box-border)</li>
              <li>• Focus states with brand color outlines</li>
              <li>• Disabled buttons prevent hover effects</li>
            </ul>
          </div>
          <div>
            <h4 className="font-space-grotesk mb-2 font-medium text-brand-slate-gray">
              Usage & Best Practices
            </h4>
            <ul className="font-inter space-y-1 text-sm text-brand-slate-gray">
              <li>
                • Use <code>variant</code> prop for consistent styling
              </li>
              <li>
                • <code>size=&ldquo;lg&rdquo;</code> for hero sections
              </li>
              <li>
                • <code>size=&ldquo;sm&rdquo;</code> for compact areas
              </li>
              <li>• Icons should be 16px (w-4 h-4) or 20px (w-5 h-5)</li>
              <li>• Limit to 2-3 primary buttons per page</li>
              <li>• Built-in accessibility and focus states</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
