import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AuthSignInFormProps {
  email: string;
  onEmailChange: (email: string) => void;
  loading: boolean;
  onSubmit: () => void;
}

export function AuthSignInForm({
  email,
  onEmailChange,
  loading,
  onSubmit,
}: AuthSignInFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Sending…" : "Send sign-in link"}
      </Button>
    </form>
  );
}
