import { Action, Status } from '@/lib/proposal/types'

// actionStateMachine is a finite state machine that determines the next status of a proposal based on the current status and the action to be taken.
export function actionStateMachine(
  currentStatus: Status | undefined,
  action: Action,
  isOrganizer: boolean,
): { status: Status; isValidAction: boolean } {
  let status = currentStatus || Status.draft
  let isValidAction = false

  switch (status) {
    case Status.draft:
      if (action === Action.submit) {
        status = Status.submitted
        isValidAction = true
      } else if (action === Action.delete) {
        status = Status.deleted
        isValidAction = true
      }
      break
    case Status.submitted:
      if (action === Action.unsubmit) {
        status = Status.draft
        isValidAction = true
      } else if (isOrganizer && action === Action.accept) {
        status = Status.accepted
        isValidAction = true
      } else if (isOrganizer && action === Action.reject) {
        status = Status.rejected
        isValidAction = true
      }
      break
    case Status.accepted:
      if (isOrganizer && action === Action.remind) {
        status = Status.accepted
        isValidAction = true
      } else if (action === Action.confirm) {
        status = Status.confirmed
        isValidAction = true
      } else if (action === Action.withdraw) {
        status = Status.withdrawn
        isValidAction = true
      } else if (isOrganizer && action === Action.reject) {
        status = Status.rejected
        isValidAction = true
      }
      break
    case Status.rejected:
      if (isOrganizer && action === Action.accept) {
        status = Status.accepted
        isValidAction = true
      }
    case Status.confirmed:
      if (action === Action.withdraw) {
        status = Status.withdrawn
        isValidAction = true
      }
      break
  }

  return { status, isValidAction }
}
