import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <span className="text-lg font-semibold tracking-tight">Canonizr</span>
          <Link href="/auth">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Documents to Markdown
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            One API call. PDFs, DOCX, images — converted to clean Markdown with
            AI-powered image captioning. Pay per use, 50MB free every month.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link href="/auth">
              <Button size="lg">Get started free</Button>
            </Link>
            <Link href="/docs">
              <Button variant="outline" size="lg">
                Documentation
              </Button>
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-4xl gap-6 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Simple API</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              POST a file, get Markdown back. One endpoint, no configuration
              needed. Works with curl, Python, JavaScript, anything.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Image Captioning</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Embedded images are automatically captioned using GPT-4o and
              included as alt text in the Markdown output.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pay Per Use</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              $0.003 per 100KB processed. 500 free units (50MB) every month. No
              minimum commitment, no setup fees.
            </CardContent>
          </Card>
        </div>

        <Card className="mx-auto mt-16 max-w-2xl">
          <CardContent className="p-6">
            <pre className="overflow-x-auto text-sm">
              <code>{`curl -X POST https://api.canonizr.com/convert \\
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" \\
  -F "file=@document.pdf"`}</code>
            </pre>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>Canonizr by Health Data Avatar</p>
      </footer>
    </div>
  );
}
