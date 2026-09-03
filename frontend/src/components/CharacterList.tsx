// Character list component

import { useEffect, useState } from 'react';
import { characterApi } from '../services/api';
import type { Character } from '../types';

interface Props {
  selectedCharacter: Character | null;
  onSelectCharacter: (character: Character) => void;
}

function CharacterList({ selectedCharacter, onSelectCharacter }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      setLoading(true);
      const data = await characterApi.getAll();
      setCharacters(data);
      setError(null);
    } catch (err) {
      setError('Failed to load characters');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="character-list">
        <h3>Characters</h3>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="character-list">
        <h3>Characters</h3>
        <div className="error">{error}</div>
        <button onClick={loadCharacters}>Retry</button>
      </div>
    );
  }

  return (
    <div className="character-list">
      <h3>Characters</h3>
      {characters.length === 0 ? (
        <div className="empty">No characters yet</div>
      ) : (
        <ul>
          {characters.map((char) => (
            <li
              key={char.id}
              className={`character-item ${selectedCharacter?.id === char.id ? 'selected' : ''}`}
              onClick={() => onSelectCharacter(char)}
            >
              <div className="character-avatar">
                {char.avatar_url ? (
                  <img src={char.avatar_url} alt={char.name} />
                ) : (
                  <div className="avatar-placeholder">{char.name[0]}</div>
                )}
              </div>
              <div className="character-info">
                <span className="character-name">{char.name}</span>
                <span className="character-desc">{char.description}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CharacterList;
