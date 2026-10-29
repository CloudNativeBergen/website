import { describe, it, expect } from 'vitest'
import { boardViewFromParam, withoutBoardFilters } from './board-params'

describe('boardViewFromParam', () => {
  it('follows ?board= and falls back to the pipeline', () => {
    expect(boardViewFromParam('contract')).toBe('contract')
    expect(boardViewFromParam('invoice')).toBe('invoice')
    expect(boardViewFromParam(null)).toBe('pipeline')
    expect(boardViewFromParam('bogus')).toBe('pipeline')
  })
})

describe('withoutBoardFilters', () => {
  it('drops the filters and keeps the board, panel and edit params', () => {
    const query =
      'board=contract&tiers=a,b&assignedTo=me&team=t&tags=x&needsFollowUp=true&action=all&sponsor=s1&view=contacts&edit=logo'
    expect(withoutBoardFilters(query)).toBe(
      'board=contract&sponsor=s1&view=contacts&edit=logo',
    )
  })
})
