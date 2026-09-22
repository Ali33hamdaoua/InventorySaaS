import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { loginSchema, type LoginDto } from '@inventorymdb/shared';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { BRAND, primaryAlpha } from '@/lib/brand';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);

  const form = useForm<LoginDto>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const loginMutation = useMutation({
    mutationFn: authService.login,
    onSuccess: (data) => {
      setSession(data.accessToken, data.user);
      const from =
        (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    },
    onError: () => {
      toast.error('Identifiants invalides');
    },
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Background brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            `radial-gradient(700px circle at 80% 20%, ${primaryAlpha(0.18)}, transparent 60%), radial-gradient(500px circle at 10% 90%, ${primaryAlpha(0.1)}, transparent 60%)`,
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo
            size={96}
            style={{ filter: `drop-shadow(0 8px 30px ${primaryAlpha(0.45)})` }}
          />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{BRAND.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Plateforme de gestion d'inventaire
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/80 p-7 backdrop-blur-sm">
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((values) => loginMutation.mutate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="admin@inventorymdb.local"
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Mot de passe
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button
              type="submit"
              className="btn-brand-glow w-full uppercase tracking-[0.12em]"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </div>

        <p className="text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          smartresto.tech
        </p>
      </div>
    </div>
  );
}
