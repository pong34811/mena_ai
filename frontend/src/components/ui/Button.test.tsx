import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  afterEach(() => cleanup())

  it('renders with default variant and size', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button')
    expect(button.textContent).toBe('Click me')
    expect(button.className).toContain('bg-primary')
    expect(button.className).toContain('h-10')
  })

  it('applies variant classes', () => {
    render(<Button variant="destructive">Delete</Button>)
    const button = screen.getByRole('button')
    expect(button.className).toContain('bg-error')
  })

  it('applies size classes', () => {
    render(<Button size="sm">Small</Button>)
    const button = screen.getByRole('button')
    expect(button.className).toContain('h-8')
  })

  it('applies icon size', () => {
    render(<Button size="icon">X</Button>)
    const button = screen.getByRole('button')
    expect(button.className).toContain('h-10 w-10')
  })

  it('handles click events', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.className).toContain('disabled:opacity-50')
  })

  it('shows loading spinner and is disabled when loading', () => {
    render(<Button loading>Submit</Button>)
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.querySelector('svg')).toBeTruthy()
  })

  it('does not fire click when loading', () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Submit</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('forwards additional props', () => {
    render(<Button type="submit" data-testid="my-button">Submit</Button>)
    const button = screen.getByTestId('my-button')
    expect(button.getAttribute('type')).toBe('submit')
  })

  it('forwards className', () => {
    render(<Button className="custom-class">Custom</Button>)
    const button = screen.getByRole('button')
    expect(button.className).toContain('custom-class')
  })

  it('renders all variants without error', () => {
    const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const
    variants.forEach((variant) => {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>)
      expect(screen.getByText(variant)).toBeTruthy()
      unmount()
    })
  })

  it('renders all sizes without error', () => {
    const sizes = ['default', 'sm', 'lg', 'icon'] as const
    sizes.forEach((size) => {
      const { unmount } = render(<Button size={size}>{size}</Button>)
      expect(screen.getByText(size)).toBeTruthy()
      unmount()
    })
  })
})
