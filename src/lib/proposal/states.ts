import { Action, Status } from '@/lib/proposal/types'

// actionStateMachine is a finite state machine that determines the next status of a proposal based on the current status and the action to be taken.
export function actionStateMachine(
  currentStatus: Status | undefined,
  action: Action,
  isOrganizer: boolean,
): { status: Status; isValidAction: boolean } {
  let status = currentStatus || Status.draft

  switch (status) {
    case Status.draft:
      if (action === Action.submit) {
        status = Status.submitted
      } else if (action === Action.delete) {
        status = Status.deleted
      }
      break
    case Status.submitted:
      if (action === Action.unsubmit) {
        status = Status.draft
      } else if (isOrganizer && action === Action.accept) {
        status = Status.accepted
      } else if (isOrganizer && action === Action.reject) {
        status = Status.rejected
      }
      break
    case Status.accepted:
      if (action === Action.confirm) {
        status = Status.confirmed
      } else if (action === Action.withdraw) {
        status = Status.withdrawn
      } else if (isOrganizer && action === Action.reject) {
        status = Status.rejected
      }
      break
    case Status.rejected:
      if (isOrganizer && action === Action.accept) {
        status = Status.accepted
      }
    case Status.confirmed:
      if (action === Action.withdraw) {
        status = Status.withdrawn
      }
      break
  }

  return { status, isValidAction: status !== currentStatus }
}
