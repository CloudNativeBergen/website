import { Action, Status } from '../types'

export function actionStateMachine(
  currentStatus: Status | undefined,
  action: Action,
  isOrganizer: boolean,
): { status: Status; isValidAction: boolean } {
  let status = currentStatus || Status.draft
  let isValidAction = true

  switch (status) {
    case Status.draft:
      if (action === Action.submit) {
        status = Status.submitted
      } else if (action === Action.delete) {
        status = Status.deleted
      } else {
        isValidAction = false
      }
      break
    case Status.submitted:
      if (action === Action.unsubmit) {
        status = Status.draft
      } else if (isOrganizer && action === Action.accept) {
        status = Status.accepted
      } else if (isOrganizer && action === Action.reject) {
        status = Status.rejected
      } else {
        isValidAction = false
      }
      break
    case Status.accepted:
      if (isOrganizer && action === Action.remind) {
      } else if (action === Action.confirm) {
        status = Status.confirmed
      } else if (action === Action.withdraw) {
        status = Status.withdrawn
      } else if (isOrganizer && action === Action.reject) {
        status = Status.rejected
      } else {
        isValidAction = false
      }
      break
    case Status.rejected:
      if (isOrganizer && action === Action.accept) {
        status = Status.accepted
      } else {
        isValidAction = false
      }
      break
    case Status.confirmed:
      if (action === Action.withdraw) {
        status = Status.withdrawn
      } else {
        isValidAction = false
      }
      break
    default:
      isValidAction = false
  }

  return { status, isValidAction }
}

export function getAllowedActions(
  status: Status,
  isOrganizer: boolean,
  isSpeaker: boolean,
): Action[] {
  const actions: Action[] = []

  if (isSpeaker) {
    switch (status) {
      case Status.draft:
        actions.push(Action.submit, Action.delete, Action.edit)
        break
      case Status.submitted:
        actions.push(Action.unsubmit, Action.edit)
        break
      case Status.accepted:
        actions.push(Action.confirm, Action.withdraw)
        break
      case Status.confirmed:
        actions.push(Action.withdraw)
        break
    }
  }

  if (isOrganizer) {
    actions.push(Action.view)

    switch (status) {
      case Status.submitted:
        actions.push(Action.accept, Action.reject)
        break
      case Status.accepted:
        actions.push(Action.remind, Action.reject)
        break
      case Status.rejected:
        actions.push(Action.accept)
        break
    }
  }

  return [...new Set(actions)]
}

export function isActionAllowed(
  action: Action,
  status: Status,
  isOrganizer: boolean,
  isSpeaker: boolean,
): boolean {
  const allowedActions = getAllowedActions(status, isOrganizer, isSpeaker)
  return allowedActions.includes(action)
}
