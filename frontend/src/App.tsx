// Main App component with routing

import { useState } from 'react';
import Chat from './components/Chat';
import CharacterList from './components/CharacterList';
import LLMSettings from './components/LLMSettings';
import type { Character } from './types';

type Page = 'chat' | 'settings';

function App() {
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('chat');

  return (
    <div className="app">
      <header className="app-header">
        <button
          className="menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          ☰
        </button>
        <h1>MENA AI VTuber</h1>
        <div className="header-nav">
          <button
            className={`nav-btn ${currentPage === 'chat' ? 'active' : ''}`}
            onClick={() => setCurrentPage('chat')}
          >
            Chat
          </button>
          <button
            className={`nav-btn ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentPage('settings')}
          >
            Settings
          </button>
        </div>
        <div className="header-status">
          <span className="status-indicator online" />
          <span>Online</span>
        </div>
      </header>

      <div className="app-body">
        {currentPage === 'chat' && (
          <>
            {sidebarOpen && (
              <aside className="sidebar">
                <CharacterList
                  selectedCharacter={selectedCharacter}
                  onSelectCharacter={setSelectedCharacter}
                />
              </aside>
            )}
            <main className="main-content">
              {selectedCharacter ? (
                <Chat character={selectedCharacter} />
              ) : (
                <div className="no-character">
                  <h2>Welcome to MENA AI VTuber</h2>
                  <p>Select a character from the sidebar to start chatting</p>
                </div>
              )}
            </main>
          </>
        )}

        {currentPage === 'settings' && (
          <main className="main-content settings-page">
            <LLMSettings />
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
