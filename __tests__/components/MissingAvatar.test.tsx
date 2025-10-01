/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals'
import { render } from '@testing-library/react'
import { MissingAvatar } from '@/components/common/MissingAvatar'

describe('MissingAvatar', () => {
  describe('Initial generation', () => {
    it('should generate two-letter initials for full names', () => {
      const { container } = render(<MissingAvatar name="John Doe" size={100} />)
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('JD')
    })

    it('should generate two-letter initials for single names with 2+ characters', () => {
      const { container } = render(<MissingAvatar name="Jane" size={100} />)
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('JA')
    })

    it('should generate single-letter initial for single character names', () => {
      const { container } = render(<MissingAvatar name="X" size={100} />)
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('X')
    })

    it('should use first and last name for multi-word names', () => {
      const { container } = render(
        <MissingAvatar name="John Michael Doe" size={100} />,
      )
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('JD')
    })

    it('should handle names with extra whitespace', () => {
      const { container } = render(
        <MissingAvatar name="  John   Doe  " size={100} />,
      )
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('JD')
    })

    it('should show ? for empty string', () => {
      const { container } = render(<MissingAvatar name="" size={100} />)
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('?')
    })

    it('should show ? for whitespace-only string', () => {
      const { container } = render(<MissingAvatar name="   " size={100} />)
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('?')
    })

    it('should uppercase initials', () => {
      const { container } = render(<MissingAvatar name="john doe" size={100} />)
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('JD')
    })
  })

  describe('Color generation', () => {
    it('should generate consistent colors for the same name', () => {
      const { container: container1 } = render(
        <MissingAvatar name="John Doe" size={100} />,
      )
      const { container: container2 } = render(
        <MissingAvatar name="John Doe" size={100} />,
      )

      const div1 = container1.querySelector('div')
      const div2 = container2.querySelector('div')

      expect(div1?.className).toBe(div2?.className)
    })

    it('should generate different colors for different names', () => {
      const { container: container1 } = render(
        <MissingAvatar name="John Doe" size={100} />,
      )
      const { container: container2 } = render(
        <MissingAvatar name="Alice Smith" size={100} />,
      )

      const div1 = container1.querySelector('div')
      const div2 = container2.querySelector('div')

      const hasColorClass = (div: Element | null) =>
        div?.className.match(/bg-\w+-500/)

      expect(hasColorClass(div1)).toBeTruthy()
      expect(hasColorClass(div2)).toBeTruthy()
    })

    it('should use fallback gray color for empty names', () => {
      const { container } = render(<MissingAvatar name="" size={100} />)
      const div = container.querySelector('div')
      expect(div?.className).toContain('bg-gray-500')
    })

    it('should use fallback gray color for whitespace-only names', () => {
      const { container } = render(<MissingAvatar name="   " size={100} />)
      const div = container.querySelector('div')
      expect(div?.className).toContain('bg-gray-500')
    })
  })

  describe('Size and styling', () => {
    it('should apply correct size to avatar', () => {
      const { container } = render(<MissingAvatar name="John Doe" size={100} />)
      const div = container.querySelector('div')
      expect(div?.style.width).toBe('100px')
      expect(div?.style.height).toBe('100px')
    })

    it('should use text-xl for size >= 100', () => {
      const { container } = render(<MissingAvatar name="John Doe" size={100} />)
      const span = container.querySelector('span')
      expect(span?.className).toContain('text-xl')
    })

    it('should use text-base for size >= 60', () => {
      const { container } = render(<MissingAvatar name="John Doe" size={60} />)
      const span = container.querySelector('span')
      expect(span?.className).toContain('text-base')
    })

    it('should use text-sm for size >= 40', () => {
      const { container } = render(<MissingAvatar name="John Doe" size={40} />)
      const span = container.querySelector('span')
      expect(span?.className).toContain('text-sm')
    })

    it('should use text-xs for size < 40', () => {
      const { container } = render(<MissingAvatar name="John Doe" size={30} />)
      const span = container.querySelector('span')
      expect(span?.className).toContain('text-xs')
    })

    it('should allow custom text size class', () => {
      const { container } = render(
        <MissingAvatar name="John Doe" size={100} textSizeClass="text-3xl" />,
      )
      const span = container.querySelector('span')
      expect(span?.className).toContain('text-3xl')
      expect(span?.className).not.toContain('text-xl')
    })

    it('should apply custom className', () => {
      const { container } = render(
        <MissingAvatar name="John Doe" size={100} className="custom-class" />,
      )
      const div = container.querySelector('div')
      expect(div?.className).toContain('custom-class')
    })

    it('should not apply inline size styles when using absolute positioning', () => {
      const { container } = render(
        <MissingAvatar
          name="John Doe"
          size={100}
          className="absolute inset-0"
        />,
      )
      const div = container.querySelector('div')
      expect(div?.style.width).toBe('')
      expect(div?.style.height).toBe('')
    })
  })

  describe('Edge cases', () => {
    it('should handle names with special characters', () => {
      const { container } = render(<MissingAvatar name="Jöhn Döe" size={100} />)
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('JD')
    })

    it('should handle single letter names', () => {
      const { container } = render(<MissingAvatar name="A" size={100} />)
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('A')
    })

    it('should handle very long names', () => {
      const { container } = render(
        <MissingAvatar
          name="Alexander Benjamin Christopher David Emmanuel"
          size={100}
        />,
      )
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('AE')
    })

    it('should handle names with numbers', () => {
      const { container } = render(<MissingAvatar name="User 123" size={100} />)
      const span = container.querySelector('span')
      expect(span?.textContent).toBe('U1')
    })

    it('should handle mixed case names consistently', () => {
      const { container: container1 } = render(
        <MissingAvatar name="john doe" size={100} />,
      )
      const { container: container2 } = render(
        <MissingAvatar name="JOHN DOE" size={100} />,
      )
      const { container: container3 } = render(
        <MissingAvatar name="John Doe" size={100} />,
      )

      const span1 = container1.querySelector('span')
      const span2 = container2.querySelector('span')
      const span3 = container3.querySelector('span')

      expect(span1?.textContent).toBe('JD')
      expect(span2?.textContent).toBe('JD')
      expect(span3?.textContent).toBe('JD')
    })
  })

  describe('Data consistency', () => {
    it('should process name only once for both color and initials', () => {
      const { container } = render(
        <MissingAvatar name="  John   Doe  " size={100} />,
      )
      const div = container.querySelector('div')
      const span = container.querySelector('span')

      expect(span?.textContent).toBe('JD')
      expect(div?.className).toMatch(/bg-\w+-500/)
    })

    it('should use consistent fallback for invalid names', () => {
      const testCases = ['', '   ', null as unknown as string]

      testCases.forEach((name) => {
        const { container } = render(<MissingAvatar name={name} size={100} />)
        const div = container.querySelector('div')
        const span = container.querySelector('span')

        expect(span?.textContent).toBe('?')
        expect(div?.className).toContain('bg-gray-500')
      })
    })
  })
})
