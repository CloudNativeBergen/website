import {
  calculateAvailableSpots,
  isWorkshopFull,
  calculateCapacityPercentage,
  getCapacityStatusColor,
  getCapacityStatusMessage,
} from '@/lib/workshop/capacity'

describe('Workshop Capacity Utils', () => {
  describe('calculateAvailableSpots', () => {
    it('calculates available spots correctly', () => {
      expect(calculateAvailableSpots(20, 5)).toBe(15)
      expect(calculateAvailableSpots(50, 30)).toBe(20)
    })

    it('returns 0 when at capacity', () => {
      expect(calculateAvailableSpots(20, 20)).toBe(0)
    })

    it('returns 0 when over capacity', () => {
      expect(calculateAvailableSpots(20, 25)).toBe(0)
    })

    it('handles zero capacity', () => {
      expect(calculateAvailableSpots(0, 0)).toBe(0)
    })

    it('handles zero signups', () => {
      expect(calculateAvailableSpots(20, 0)).toBe(20)
    })
  })

  describe('isWorkshopFull', () => {
    it('returns false when spots are available', () => {
      expect(isWorkshopFull(20, 10)).toBe(false)
      expect(isWorkshopFull(20, 19)).toBe(false)
    })

    it('returns true when at capacity', () => {
      expect(isWorkshopFull(20, 20)).toBe(true)
    })

    it('returns true when over capacity', () => {
      expect(isWorkshopFull(20, 25)).toBe(true)
    })

    it('handles zero capacity', () => {
      expect(isWorkshopFull(0, 0)).toBe(true)
      expect(isWorkshopFull(0, 5)).toBe(true)
    })
  })

  describe('calculateCapacityPercentage', () => {
    it('calculates percentage correctly', () => {
      expect(calculateCapacityPercentage(20, 10)).toBe(50)
      expect(calculateCapacityPercentage(100, 25)).toBe(25)
      expect(calculateCapacityPercentage(50, 37)).toBe(74)
    })

    it('rounds to nearest integer', () => {
      expect(calculateCapacityPercentage(20, 7)).toBe(35) // 35%
      expect(calculateCapacityPercentage(20, 3)).toBe(15) // 15%
    })

    it('returns 0 for empty workshop', () => {
      expect(calculateCapacityPercentage(20, 0)).toBe(0)
    })

    it('returns 100 when at capacity', () => {
      expect(calculateCapacityPercentage(20, 20)).toBe(100)
    })

    it('caps at 100 even when over capacity', () => {
      expect(calculateCapacityPercentage(20, 25)).toBe(100)
    })

    it('handles zero capacity', () => {
      expect(calculateCapacityPercentage(0, 0)).toBe(0)
      expect(calculateCapacityPercentage(0, 5)).toBe(0)
    })
  })

  describe('getCapacityStatusColor', () => {
    it('returns red for low attendance (< 30%)', () => {
      expect(getCapacityStatusColor(20, 0)).toBe('red')
      expect(getCapacityStatusColor(20, 1)).toBe('red')
      expect(getCapacityStatusColor(20, 5)).toBe('red') // 25%
      expect(getCapacityStatusColor(100, 29)).toBe('red') // 29%
    })

    it('returns green for healthy attendance (30-69%)', () => {
      expect(getCapacityStatusColor(20, 6)).toBe('green') // 30%
      expect(getCapacityStatusColor(20, 10)).toBe('green') // 50%
      expect(getCapacityStatusColor(20, 13)).toBe('green') // 65%
      expect(getCapacityStatusColor(100, 69)).toBe('green') // 69%
    })

    it('returns orange when filling up (>= 70%)', () => {
      expect(getCapacityStatusColor(20, 14)).toBe('orange') // 70%
      expect(getCapacityStatusColor(20, 18)).toBe('orange') // 90%
      expect(getCapacityStatusColor(20, 19)).toBe('orange') // 95%
      expect(getCapacityStatusColor(20, 20)).toBe('orange') // 100%
    })

    it('handles edge cases at boundaries', () => {
      expect(getCapacityStatusColor(100, 29)).toBe('red') // 29%
      expect(getCapacityStatusColor(100, 30)).toBe('green') // 30%
      expect(getCapacityStatusColor(100, 69)).toBe('green') // 69%
      expect(getCapacityStatusColor(100, 70)).toBe('orange') // 70%
    })
  })

  describe('getCapacityStatusMessage', () => {
    it('returns full message when no spots available', () => {
      expect(getCapacityStatusMessage(20, 20)).toBe('Workshop is full')
      expect(getCapacityStatusMessage(20, 25)).toBe('Workshop is full')
    })

    it('returns singular message for one spot', () => {
      expect(getCapacityStatusMessage(20, 19)).toBe('1 spot remaining')
    })

    it('returns urgent message when filling up (>= 70%)', () => {
      expect(getCapacityStatusMessage(20, 14)).toBe(
        '6 spots remaining - filling up fast!',
      ) // 70%
      expect(getCapacityStatusMessage(20, 18)).toBe(
        '2 spots remaining - filling up fast!',
      ) // 90%
    })

    it('returns normal message for plenty of spots', () => {
      expect(getCapacityStatusMessage(20, 5)).toBe('15 spots available') // 25%
      expect(getCapacityStatusMessage(20, 10)).toBe('10 spots available') // 50%
    })

    it('handles boundary cases', () => {
      expect(getCapacityStatusMessage(100, 69)).toBe('31 spots available') // 69%
      expect(getCapacityStatusMessage(100, 70)).toBe(
        '30 spots remaining - filling up fast!',
      ) // 70%
    })
  })
})
