"use client"

function APIKeySpan({ text }: { text: string }) {
  return (
    <span
      className={
        "font-mono truncate"
      }
    >
      {text}
    </span>
  )
}

export { APIKeySpan }
