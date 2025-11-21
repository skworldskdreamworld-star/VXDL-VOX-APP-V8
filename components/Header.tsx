
import React from 'react';
import { AppView } from '../types';
import { useTranslations } from '../hooks/useTranslations';
import SessionTimer from './SessionTimer';

type User = {
    type: 'member' | 'guest';
} | null;

interface HeaderProps {
    view: AppView;
    setView: (view: AppView) => void;
    disabled: boolean;
    onGoToBridge: () => void;
    user: User;
    onLogout: () => void;
    remainingTime?: number;
}

function Header({ view, setView, disabled, user, onGoToBridge, onLogout, remainingTime }: HeaderProps) {
  const { t } = useTranslations();
  const isGuest = user?.type === 'guest';
  
  const navItems: { id: AppView; label: string }[] = [
    { id: 'vox', label: 'VOX' },
    { id: 'vxog', label: 'VXOG' },
    { id: 'vux', label: 'VUX' },
    { id: 'vxsg', label: 'VXSG' },
    { id: 'cos', label: 'COS' },
    { id: 'vxpl', label: 'VXPL' },
  ];

  return (
    <header className="pointer-events-none fixed top-4 md:top-6 left-0 right-0 z-50 flex justify-center px-4 pt-safe">
      <div className="pointer-events-auto glass-panel rounded-2xl p-1.5 flex items-center gap-1 animate-fade-in-up shadow-2xl shadow-black/50 max-w-full">
        {/* Back Button */}
        <button
          onClick={onGoToBridge}
          className="p-3 md:p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          title={t('back_to_menu_tooltip')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-4 md:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </button>

        <div className="w-px h-6 md:h-5 bg-white/10 mx-1 flex-shrink-0"></div>

        {/* Navigation Pills - Scrollable on Mobile */}
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[calc(100vw-140px)] md:max-w-none mask-linear-fade px-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              disabled={disabled}
              className={`
                relative px-4 py-2.5 md:py-2 rounded-lg text-xs font-bold tracking-wide transition-all duration-300 whitespace-nowrap
                ${view === item.id 
                  ? 'text-black bg-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              `}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="w-px h-6 md:h-5 bg-white/10 mx-1 flex-shrink-0"></div>

        {/* User Status */}
        <div className="flex items-center gap-2 px-2 flex-shrink-0">
          {isGuest && remainingTime !== undefined && (
             <div className="hidden lg:block">
                <SessionTimer remainingTime={remainingTime} guestLayout />
             </div>
          )}
          <button
            onClick={onLogout}
            className="p-3 md:p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors"
            title="Logout"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
