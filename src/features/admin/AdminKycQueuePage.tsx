import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Video } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/utils';

const QUEUE = [
  { id: 'q1', name: 'Suresh Kumar', role: 'Driver', status: 'docs_submitted', when: '2h ago' },
  { id: 'q2', name: 'Priya Devi', role: 'Driver', status: 'video_pending', when: '5h ago' },
  { id: 'q3', name: 'Vikram Reddy', role: 'Trip Manager', status: 'video_pending', when: '1 day ago' },
  { id: 'q4', name: 'Murugan Sivam', role: 'Driver', status: 'resubmit_required', when: '2 days ago' },
];

export function AdminKycQueuePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-semibold">KYC Queue</h1>
      </header>
      <div className="p-4 space-y-3">
        {QUEUE.map((q) => (
          <Card key={q.id} className="cursor-pointer hover:border-purple-300">
            <CardContent className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>{initials(q.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="font-semibold text-sm">{q.name}</div>
                <div className="text-xs text-muted-foreground">{q.role} · {q.when}</div>
              </div>
              <Badge
                variant={
                  q.status === 'video_pending'
                    ? 'info'
                    : q.status === 'resubmit_required'
                      ? 'warning'
                      : 'muted'
                }
              >
                {q.status.replace('_', ' ')}
              </Badge>
              {q.status === 'video_pending' && (
                <Button size="sm">
                  <Video className="size-4" /> Start
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
