/**
 * shadcn 风格 Card 原语
 */
import type * as React from 'react'
import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-0 rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  )
}

function CardHeader({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 px-4 pt-4', className)}
      {...props}
    />
  )
}

function CardTitle({
  className,
  ...props
}: React.ComponentProps<'h3'>): React.JSX.Element {
  return (
    <h3
      data-slot="card-title"
      className={cn('text-sm font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot="card-description"
      className={cn('text-xs leading-5 text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardContent({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div data-slot="card-content" className={cn('px-4 pb-3', className)} {...props} />
  )
}

function CardFooter({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t border-border/70 px-4 py-3', className)}
      {...props}
    />
  )
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
