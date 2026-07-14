import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSearchUsers, SearchedUser, getProfileByUsername } from '@/hooks/useSearchUsers';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
interface MentionInputProps {
  value: string;
  onChange: (value: string, mentionedUsers: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onSubmit?: () => void;
}

export function MentionInput({
  value,
  onChange,
  placeholder = 'Escreva um comentário...',
  disabled = false,
  className,
  onSubmit,
}: MentionInputProps) {
  const [mentionQuery, setMentionQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionedUsers, setMentionedUsers] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: searchResults = [], isLoading } = useSearchUsers(mentionQuery);

  // Detectar @ no texto
  const detectMention = useCallback((text: string, cursor: number) => {
    const textBeforeCursor = text.slice(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex === -1) {
      setMentionQuery('');
      setShowSuggestions(false);
      return;
    }

    const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
    
    // Verifica se há espaço após o @
    if (textAfterAt.includes(' ') || textAfterAt.includes('\n')) {
      setMentionQuery('');
      setShowSuggestions(false);
      return;
    }

    // Só mostra se tiver pelo menos 2 caracteres
    if (textAfterAt.length >= 2) {
      setMentionQuery(textAfterAt);
      setShowSuggestions(true);
    } else if (textAfterAt.length === 0) {
      // Mostrar sugestões vazias quando só tem @
      setMentionQuery('');
      setShowSuggestions(false);
    } else {
      setMentionQuery(textAfterAt);
      setShowSuggestions(textAfterAt.length >= 2);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursor = e.target.selectionStart || 0;
    setCursorPosition(cursor);
    detectMention(newValue, cursor);
    onChange(newValue, mentionedUsers);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!showSuggestions && onSubmit) {
        onSubmit();
      }
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const insertMention = (user: SearchedUser) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = value.slice(cursorPosition);
    
    const mentionText = `@${(user.username || 'usuario').replace(/^@+/, '')} `;
    const newValue = value.slice(0, lastAtIndex) + mentionText + textAfterCursor;
    
    // Adicionar user ID aos mencionados
    if (!mentionedUsers.includes(user.id)) {
      const newMentioned = [...mentionedUsers, user.id];
      setMentionedUsers(newMentioned);
      onChange(newValue, newMentioned);
    } else {
      onChange(newValue, mentionedUsers);
    }
    
    setShowSuggestions(false);
    setMentionQuery('');
    
    // Focar no input após inserir
    setTimeout(() => {
      if (inputRef.current) {
        const newCursor = lastAtIndex + mentionText.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  };

  return (
    <div className="relative w-full">
      <Popover open={showSuggestions && searchResults.length > 0}>
        <PopoverAnchor asChild>
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground",
              "focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
            style={{ minHeight: '24px', maxHeight: '100px' }}
          />
        </PopoverAnchor>
        
        <PopoverContent 
          className="w-64 p-0" 
          align="start"
          side="top"
          sideOffset={5}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList>
              {isLoading ? (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  Buscando...
                </div>
              ) : searchResults.length === 0 ? (
                <CommandEmpty>Nenhum usuário encontrado</CommandEmpty>
              ) : (
                <CommandGroup heading="Usuários">
                  {searchResults.map((user) => (
                    <CommandItem
                      key={user.id}
                      onSelect={() => insertMention(user)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {(user.username || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {user.username ? `@${user.username}` : 'usuário'}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Componente para menção clicável com busca de profile
function MentionLink({ username, text }: { username: string; text: string }) {
  const [profileId, setProfileId] = useState<string | null>(null);
  
  useEffect(() => {
    getProfileByUsername(username).then(p => {
      if (p) setProfileId(p.id);
    });
  }, [username]);
  
  if (profileId) {
    return (
      <Link 
        to={`/creator/${profileId}`}
        className="text-primary font-medium hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </Link>
    );
  }
  
  return <span className="text-primary font-medium">{text}</span>;
}

// Função utilitária para renderizar texto com menções destacadas e clicáveis
export function renderMentions(content: string, mentionedUserIds?: string[]): React.ReactNode {
  const mentionRegex = /@(\w+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let mentionIndex = 0;

  while ((match = mentionRegex.exec(content)) !== null) {
    // Texto antes da menção
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    
    const username = match[1];
    const profileId = mentionedUserIds?.[mentionIndex];
    
    // Se temos o ID direto, usar Link
    if (profileId) {
      parts.push(
        <Link 
          key={match.index}
          to={`/creator/${profileId}`}
          className="text-primary font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {match[0]}
        </Link>
      );
    } else {
      // Fallback: buscar dinamicamente
      parts.push(
        <MentionLink key={match.index} username={username} text={match[0]} />
      );
    }
    
    lastIndex = match.index + match[0].length;
    mentionIndex++;
  }
  
  // Texto restante após a última menção
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : content;
}
