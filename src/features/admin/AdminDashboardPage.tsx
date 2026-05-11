import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Video,
  Car,
  Languages,
  Users,
  AlertTriangle,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useGoBack } from '@/hooks/useGoBack';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const goBack = useGoBack('/home');
  const { logout, user } = useAuth();

  const tiles = [
    {
      icon: <ShieldCheck className="size-5 text-purple-600" />,
      title: 'KYC Queue',
      desc: '3 drivers pending review',
      count: 3,
      onClick: () => navigate('/administration/kyc'),
    },
    {
      icon: <Video className="size-5 text-blue-600" />,
      title: 'Video Call Console',
      desc: '2 calls scheduled today',
      count: 2,
      onClick: () => navigate('/administration/kyc'),
    },
    {
      icon: <Car className="size-5 text-emerald-600" />,
      title: 'Vehicle Eligibility',
      desc: '14 expiring in 90 days',
      count: 14,
      onClick: () => navigate('/administration/vehicles'),
    },
    {
      icon: <Languages className="size-5 text-amber-600" />,
      title: 'Translation Manager',
      desc: 'ta 96.8% · hi 86.7%',
      onClick: () => navigate('/administration/translations'),
    },
    {
      icon: <Users className="size-5 text-blue-700" />,
      title: 'Drivers',
      desc: '347 active · search & filter',
      onClick: () => navigate('/administration/drivers'),
    },
    { icon: <AlertTriangle className="size-5 text-red-600" />, title: 'Reviews to moderate', desc: '2 flagged', count: 2 },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <div className="text-xs uppercase tracking-wider text-purple-600 font-semibold">Admin</div>
            <div className="font-semibold">{user?.displayName}</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { logout(); navigate('/', { replace: true }); }} aria-label="Log out">
          <LogOut className="size-5" />
        </Button>
      </header>

      <div className="p-4 space-y-3">
        <h2 className="font-semibold mb-2">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((t) => (
            <Card
              key={t.title}
              onClick={t.onClick}
              className={t.onClick ? 'cursor-pointer hover:border-purple-300' : ''}
            >
              <CardContent>
                <div className="flex items-start justify-between mb-2">
                  {t.icon}
                  {t.count !== undefined && (
                    <Badge variant="warning">{t.count}</Badge>
                  )}
                </div>
                <div className="font-semibold text-sm">{t.title}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
