"use client"

function APIKeySpan({ text }: { text: string }) {
  return (
    <span
      className={
        "font-mono"
      }
    >
      {text}
    </span>
  )
}

export { APIKeySpan }
