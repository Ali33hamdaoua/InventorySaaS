import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page introuvable.</p>
      <Button asChild>
        <Link to="/dashboard">Retour au dashboard</Link>
      </Button>
    </div>
  );
}
