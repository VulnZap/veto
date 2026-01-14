"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface MarqueeProps extends React.HTMLAttributes<HTMLDivElement> {
  pauseOnHover?: boolean
  reverse?: boolean
  fade?: boolean
  innerClassName?: string
}

export function Marquee({
  children,
  className,
  pauseOnHover = false,
  reverse = false,
  fade = false,
  innerClassName,
  ...props
}: MarqueeProps) {
  return (
    <div
      className={cn("flex overflow-hidden", className)}
      {...props}
    >
      <div
        className={cn(
          "flex min-w-full shrink-0 justify-around gap-4",
          "animate-marquee",
          reverse && "animate-marquee-reverse",
          pauseOnHover && "hover:[animation-play-state:paused]"
        )}
      >
        {children}
      </div>
    </div>
  )
}
