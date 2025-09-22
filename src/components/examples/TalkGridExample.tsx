import { TalkPromotionCard } from '@/components/TalkPromotionCard'
import { ProposalExisting } from '@/lib/proposal/types'

interface TalkGridExampleProps {
  talks: Array<{
    talk: ProposalExisting
    startTime: string
    endTime: string
  }>
}

export function TalkGridExample({ talks }: TalkGridExampleProps) {
  return (
    <div className="space-y-8">
      {talks.length > 0 && (
        <div className="mb-12">
          <h2 className="font-space-grotesk mb-6 text-2xl font-bold text-brand-slate-gray">
            Featured Session
          </h2>
          <div className="max-w-2xl">
            <TalkPromotionCard
              talk={talks[0].talk}
              slot={{
                time: `${talks[0].startTime} – ${talks[0].endTime}`,
              }}
              variant="featured"
              ctaText="Learn More"
              ctaUrl="/program"
            />
          </div>
        </div>
      )}

      {talks.length > 1 && (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-space-grotesk text-2xl font-bold text-brand-slate-gray">
              More Amazing Sessions
            </h3>
            <a
              href="/program"
              className="font-inter text-sm font-semibold text-brand-cloud-blue hover:text-brand-cloud-blue/80"
            >
              View all sessions →
            </a>
          </div>

          <div className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {talks.slice(1).map((slot) => (
              <TalkPromotionCard
                key={`${slot.startTime}-${slot.talk._id}`}
                talk={slot.talk}
                slot={{
                  time: `${slot.startTime} – ${slot.endTime}`,
                }}
                variant="default"
                ctaText="Learn More"
                ctaUrl="/program"
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-space-grotesk mb-6 text-xl font-bold text-brand-slate-gray">
          Quick Sessions Overview
        </h3>
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {talks.slice(0, 4).map((slot) => (
            <TalkPromotionCard
              key={`compact-${slot.startTime}-${slot.talk._id}`}
              talk={slot.talk}
              slot={{
                time: `${slot.startTime} – ${slot.endTime}`,
              }}
              variant="compact"
              ctaText="View"
              ctaUrl="/program"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
