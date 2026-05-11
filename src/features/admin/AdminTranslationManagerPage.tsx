import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Edit3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const LANGS = [
  { code: 'en', name: 'English', native: 'English', total: 847, translated: 847 },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', total: 847, translated: 820 },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', total: 847, translated: 734 },
];

export function AdminTranslationManagerPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-semibold">Translation Manager</h1>
      </header>
      <div className="p-4 space-y-4">
        <div className="flex justify-end">
          <Button size="sm">
            <Plus className="size-4" /> Add Language
          </Button>
        </div>

        <Card>
          <CardContent>
            <div className="font-semibold text-sm mb-3">Language Coverage</div>
            <div className="space-y-3">
              {LANGS.map((l) => {
                const pct = Math.round((l.translated / l.total) * 100);
                return (
                  <div key={l.code} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{l.native}</span>
                        <Badge variant="muted">{l.code}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {l.translated} / {l.total}
                        </span>
                        <Badge variant={pct === 100 ? 'success' : 'warning'}>
                          {pct}%
                        </Badge>
                        <Button size="sm" variant="outline">
                          <Edit3 className="size-3.5" /> Edit
                        </Button>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={pct === 100 ? 'h-full bg-emerald-500' : 'h-full bg-amber-500'}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center italic">
          CSV import/export · Key-by-key editor · Missing-keys auto-logged when drivers hit fallback
        </p>
      </div>
    </div>
  );
}
