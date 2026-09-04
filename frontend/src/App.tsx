import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ChatPage from './pages/ChatPage'
import SettingsPage from './pages/SettingsPage'
import CharactersPage from './pages/CharactersPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/characters" element={<CharactersPage />} />
        <Route path="/characters/new" element={<CharactersPage />} />
        <Route path="/characters/edit/:id" element={<CharactersPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
