/**
 * DraggableImagePosition
 * Permite ao dono "pegar e arrastar" uma imagem (cover/avatar) para
 * reposicionar o foco visual. Persiste a posição via callback.
 *
 * - Usa pointer events (mouse + touch unificados).
 * - Salva apenas quando solta o ponteiro (pointerup), evitando spam.
 * - Quando não está em modo edição, é totalmente transparente (zero overhead).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Move, Check, X } from 'lucide-react';

interface Props {
  src: string | null | undefined;
  alt?: string;
  positionX: number | null | undefined; // 0-100
  positionY: number | null | undefined; // 0-100
  editable: boolean;
  className?: string;
  fallback?: React.ReactNode;
  onSave: (next: { x: number; y: number }) => void | Promise<void>;
}

export function DraggableImagePosition({
  src,
  alt = '',
  positionX,
  positionY,
  editable,
  className,
  fallback,
  onSave,
}: Props) {
  const initialX = Math.max(0, Math.min(100, Number(positionX ?? 50)));
  const initialY = Math.max(0, Math.min(100, Number(positionY ?? 50)));

  const [editing, setEditing] = useState(false);
  const [x, setX] = useState(initialX);
  const [y, setY] = useState(initialY);
  const [saving, setSaving] = useState(false);

  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    boxW: number;
    boxH: number;
    pointerId: number;
  } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Sync external changes when not editing
  useEffect(() => {
    if (!editing) {
      setX(Math.max(0, Math.min(100, Number(positionX ?? 50))));
      setY(Math.max(0, Math.min(100, Number(positionY ?? 50))));
    }
  }, [positionX, positionY, editing]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || !src) return;
    // Não iniciar drag quando o clique começa em um botão (Salvar/Cancelar/Posicionar),
    // senão o setPointerCapture rouba o evento de clique do botão.
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button')) return;
    const el = boxRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: x,
      startY: y,
      boxW: rect.width || 1,
      boxH: rect.height || 1,
      pointerId: e.pointerId,
    };
  }, [editing, src, x, y]);


  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    // Arrastar a IMAGEM movendo "object-position": deslocar para cima/esquerda
    // aumenta a porcentagem (mostra mais da parte de baixo/direita).
    const dxPct = ((e.clientX - d.startClientX) / d.boxW) * 100;
    const dyPct = ((e.clientY - d.startClientY) / d.boxH) * 100;
    const nx = Math.max(0, Math.min(100, d.startX - dxPct));
    const ny = Math.max(0, Math.min(100, d.startY - dyPct));
    setX(nx);
    setY(ny);
  }, []);

  const onPointerUp = useCallback((_e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    setX(initialX);
    setY(initialY);
    setEditing(false);
  }, [initialX, initialY]);

  const save = useCallback(async () => {
    try {
      setSaving(true);
      await onSave({ x: Math.round(x), y: Math.round(y) });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [onSave, x, y]);

  return (
    <div
      ref={boxRef}
      className={`relative ${className ?? ''} ${editing ? 'cursor-grabbing select-none' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: editing ? 'none' : undefined }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover pointer-events-none"
          style={{ objectPosition: `${x}% ${y}%` }}
        />
      ) : (
        fallback ?? null
      )}

      {/* Botão de iniciar edição — só aparece se o usuário pode editar */}
      {editable && !editing && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="absolute right-2 bottom-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 hover:bg-black/85 backdrop-blur px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow"
          title="Reposicionar imagem"
        >
          <Move className="h-3 w-3" /> Posicionar
        </button>
      )}

      {/* Overlay de edição */}
      {editing && (
        <>
          <div className="pointer-events-none absolute inset-0 ring-2 ring-fuchsia-400/80 ring-inset" />
          <div className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 backdrop-blur px-2 py-1 text-[10px] font-semibold text-white">
            <Move className="h-3 w-3" /> Arraste para enquadrar
          </div>
          <div className="absolute right-2 bottom-2 z-10 inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); cancel(); }}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-full bg-black/70 hover:bg-black/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void save(); }}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-60"
            >
              <Check className="h-3 w-3" /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
