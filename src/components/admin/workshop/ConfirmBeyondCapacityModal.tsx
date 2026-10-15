'use client'

import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import type { FullRefusal } from './useSignupActions'

interface ConfirmBeyondCapacityModalProps {
  /** The refusal to ask about; `null` closes the question. */
  refusal: FullRefusal | null
  /** Sends the confirm again with the count shown accepted. */
  onConfirm: () => void
  /** Leaves the sign-up on the waitlist. */
  onClose: () => void
  isLoading?: boolean
}

/** "1 seat" / "2 seats". */
const seats = (n: number) => `${n} seat${n === 1 ? '' : 's'}`

/**
 * The question an organizer is asked when their "Move to Confirmed" would take
 * a full workshop past capacity (#1358). It shows the count as it is NOW, not
 * as the list showed it: an attendee may have taken the last seat while the
 * list was open. "Confirm beyond capacity" accepts exactly the count shown;
 * if a seat changes hands before it lands, the server asks again with the new
 * numbers, and `changed` says so. `guardSecondTap`: it opens from the row's
 * "Move to Confirmed", which on a phone sits where its own button appears.
 */
export function ConfirmBeyondCapacityModal({
  refusal,
  onConfirm,
  onClose,
  isLoading = false,
}: ConfirmBeyondCapacityModalProps) {
  const message = refusal
    ? `${refusal.changed ? 'The seats changed while you decided. ' : ''}${refusal.workshopTitle} has ${refusal.seatsTaken} of ${refusal.capacity} seats taken. Confirming ${refusal.userName} goes ${seats(refusal.after - refusal.capacity)} past capacity.`
    : ''
  return (
    <ConfirmationModal
      isOpen={refusal !== null}
      onClose={onClose}
      onConfirm={onConfirm}
      title={refusal?.changed ? 'Still full' : 'Workshop is full'}
      message={message}
      confirmButtonText="Confirm beyond capacity"
      cancelButtonText="Keep on waitlist"
      variant="warning"
      isLoading={isLoading}
      guardSecondTap
    />
  )
}
