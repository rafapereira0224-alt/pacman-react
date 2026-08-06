import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Auth from './Auth';
import Game from './Game.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loadingSession) {
    return (
      <div style={{ background: '#09090b', color: '#fff', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        Carregando...
      </div>
    );
  }

  if (!session) {
    return <Auth onLogin={(userSession) => setSession(userSession)} />;
  }

  return (
    <div className="app">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: '#18181b', borderBottom: '1px solid #27272a' }}>
        <h1 style={{ fontSize: '1.2rem', color: '#facc15', margin: 0 }}>Pac-Man React</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Sair
        </button>
      </div>
      <Game session={session} />
    </div>
  );
}