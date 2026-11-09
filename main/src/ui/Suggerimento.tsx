import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { AIUTI, type ChiaveAiuto } from '../lib/aiuti';

/** Quanto deve restare fermo il puntatore (o il focus) prima che compaia il suggerimento. */
export const RITARDO_SUGGERIMENTO_MS = 1500;

export const testoAiuto = (k: ChiaveAiuto) => AIUTI[k];

/** Timer del suggerimento: `avvia` apre dopo `ritardo`, `chiudi` annulla o chiude. Senza React, cosi' si prova con i fake timers. */
export function creaTemporizzatore(ritardo: number, cambia: (aperto: boolean) => void) {
  let t: ReturnType<typeof setTimeout> | undefined;
  let aperto = false;
  const annulla = () => {
    if (t !== undefined) clearTimeout(t);
    t = undefined;
  };
  return {
    avvia() {
      annulla();
      t = setTimeout(() => {
        t = undefined;
        aperto = true;
        cambia(true);
      }, ritardo);
    },
    chiudi() {
      annulla();
      if (aperto) {
        aperto = false;
        cambia(false);
      }
    },
  };
}

/** Posizione (coordinate della finestra) del riquadro: sotto l'elemento se c'e' spazio, altrimenti sopra, sempre dentro lo schermo. */
export function posiziona(
  ancora: { top: number; bottom: number; left: number; width: number },
  riquadro: { width: number; height: number },
  finestra: { width: number; height: number },
  margine = 8,
) {
  const sotto = finestra.height - ancora.bottom - margine;
  const sopra = ancora.top - margine;
  const staSotto = riquadro.height <= sotto || sotto >= sopra;
  const top = staSotto ? ancora.bottom + 6 : Math.max(margine, ancora.top - riquadro.height - 6);
  const left = Math.min(Math.max(margine, ancora.left + ancora.width / 2 - riquadro.width / 2), Math.max(margine, finestra.width - riquadro.width - margine));
  return { top, left, sotto: staSotto };
}

/** Dispositivi senza puntatore che passa sopra (telefono, tablet): li' serve il "?" al tocco. */
function useSenzaHover() {
  const [si, setSi] = useState(() => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(hover: none)');
    const f = () => setSi(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return si;
}

function Riquadro({ id, testo, aperto, ancora }: { id: string; testo: string; aperto: boolean; ancora: Element | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!aperto) {
      if (el.matches(':popover-open')) el.hidePopover();
      return;
    }
    // popover = livello superiore: resta sopra anche ai dialoghi modali.
    if (!el.matches(':popover-open')) el.showPopover();
    if (!ancora) return;
    const p = posiziona(ancora.getBoundingClientRect(), { width: el.offsetWidth, height: el.offsetHeight }, { width: innerWidth, height: innerHeight });
    el.style.top = `${p.top}px`;
    el.style.left = `${p.left}px`;
  }, [aperto, ancora]);
  return (
    <div ref={ref} id={id} role="tooltip" popover="manual" className="suggerimento">
      {testo}
    </div>
  );
}

/** Stato condiviso: apertura con ritardo, chiusura con Esc, scorrimento o clic. Gli ascoltatori di documento vivono solo mentre il timer corre o il riquadro e' aperto. */
function useSuggerimento(ritardo: number) {
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(false);
  const [ancora, setAncora] = useState<Element | null>(null);
  const timer = useRef<ReturnType<typeof creaTemporizzatore>>(null);
  if (!timer.current) timer.current = creaTemporizzatore(ritardo, setAperto);
  const t = timer.current;
  const avvia = useCallback(() => { setAttivo(true); t.avvia(); }, [t]);
  const chiudi = useCallback(() => { t.chiudi(); setAttivo(false); }, [t]);
  useEffect(() => () => t.chiudi(), [t]);
  useEffect(() => {
    if (!attivo) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (aperto) {
        e.preventDefault();
        e.stopPropagation(); // chiude solo il suggerimento, non il dialogo che lo contiene
      }
      chiudi();
    };
    document.addEventListener('keydown', esc, true);
    document.addEventListener('scroll', chiudi, true);
    return () => {
      document.removeEventListener('keydown', esc, true);
      document.removeEventListener('scroll', chiudi, true);
    };
  }, [attivo, aperto, chiudi]);
  return { aperto, ancora, setAncora, avvia, chiudi };
}

export interface Attacchi {
  onMouseEnter: (e: MouseEvent) => void;
  onMouseLeave: () => void;
  onFocus: (e: FocusEvent) => void;
  onBlur: () => void;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

interface Props {
  testo: string;
  ritardo?: number;
  /** Un solo elemento (gli attacchi vengono aggiunti a lui) oppure una funzione che riceve gli attacchi e l'id da usare in aria-describedby. */
  children: ReactElement<Record<string, unknown>> | ((a: { attacchi: Attacchi; descrittoDa: string }) => ReactNode);
}

/** Avvolge un elemento: dopo 1,5 s di puntatore fermo (o di focus da tastiera) mostra una spiegazione breve.
 *  Mouseleave, clic, scorrimento ed Esc lo annullano. Sui dispositivi senza hover non fa nulla: li' c'e' `PuntoAiuto`. */
export function Suggerimento({ testo, ritardo = RITARDO_SUGGERIMENTO_MS, children }: Props) {
  const id = useId();
  const senzaHover = useSenzaHover();
  const { aperto, ancora, setAncora, avvia, chiudi } = useSuggerimento(ritardo);
  const attiva = !senzaHover;
  const attacchi: Attacchi = {
    onMouseEnter: (e) => {
      if (!attiva) return;
      setAncora(e.currentTarget as Element);
      avvia();
    },
    onMouseLeave: () => chiudi(),
    onFocus: (e) => {
      if (!attiva) return;
      let tastiera = true;
      try {
        tastiera = (e.target as Element).matches(':focus-visible');
      } catch { /* selettore non supportato: vale come tastiera */ }
      if (!tastiera) return;
      setAncora(e.currentTarget as Element);
      avvia();
    },
    onBlur: () => chiudi(),
    onClick: () => chiudi(),
    // Chi sta scrivendo non vuole spiegazioni: ogni tasto (tranne Tab) rimanda il riquadro.
    onKeyDown: (e) => {
      if (e.key === 'Escape') chiudi();
      else if (e.key !== 'Tab' && e.key !== 'Shift') chiudi();
    },
  };
  const riquadro = <Riquadro id={id} testo={testo} aperto={aperto} ancora={ancora} />;
  if (typeof children === 'function') {
    return (
      <>
        {children({ attacchi, descrittoDa: id })}
        {riquadro}
      </>
    );
  }
  const f = children.props as Partial<Attacchi> & { 'aria-describedby'?: string };
  const unisci = <K extends keyof Attacchi>(k: K) => ((...a: unknown[]) => {
    (f[k] as ((...x: unknown[]) => void) | undefined)?.(...a);
    (attacchi[k] as (...x: unknown[]) => void)(...a);
  });
  const descr = [f['aria-describedby'], id].filter(Boolean).join(' ');
  return (
    <>
      {cloneElement(children, {
        onMouseEnter: unisci('onMouseEnter'),
        onMouseLeave: unisci('onMouseLeave'),
        onFocus: unisci('onFocus'),
        onBlur: unisci('onBlur'),
        onClick: unisci('onClick'),
        onKeyDown: unisci('onKeyDown'),
        'aria-describedby': descr,
      })}
      {riquadro}
      {senzaHover && <PuntoAiuto testo={testo} />}
    </>
  );
}

/** Parola o etichetta fissa con spiegazione: sottolineata a puntini, raggiungibile da tastiera. */
export function Termine({ aiuto, children }: { aiuto: ChiaveAiuto; children: ReactNode }) {
  return (
    <Suggerimento testo={testoAiuto(aiuto)}>
      <span className="termine" tabIndex={0}>{children}</span>
    </Suggerimento>
  );
}

/** Piccolo "?" che apre il testo con un tocco: compare solo sui dispositivi senza hover. Si chiude con un altro tocco o con Esc. */
export function PuntoAiuto({ testo, etichetta = 'Spiegazione' }: { testo: string; etichetta?: string }) {
  const id = useId();
  const senzaHover = useSenzaHover();
  const [aperto, setAperto] = useState(false);
  const bottone = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aperto) return;
    const fuori = () => setAperto(false);
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setAperto(false);
    };
    document.addEventListener('pointerdown', fuori);
    document.addEventListener('scroll', fuori, true);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', fuori);
      document.removeEventListener('scroll', fuori, true);
      document.removeEventListener('keydown', esc, true);
    };
  }, [aperto]);
  if (!senzaHover) return null;
  return (
    <>
      <button
        ref={bottone}
        type="button"
        className="punto-aiuto"
        aria-label={etichetta}
        aria-describedby={id}
        aria-expanded={aperto}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setAperto(!aperto)}
      >
        ?
      </button>
      <Riquadro id={id} testo={testo} aperto={aperto} ancora={bottone.current} />
    </>
  );
}
