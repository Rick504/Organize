import { useEffect, useState } from 'react';

type InstallChoice = { outcome: 'accepted' | 'dismissed' };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setHelpOpen(false);
    };
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const onDisplayMode = () => setInstalled(isStandalone());
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    displayMode.addEventListener('change', onDisplayMode);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      displayMode.removeEventListener('change', onDisplayMode);
    };
  }, []);

  async function install() {
    if (installed) return;
    if (!promptEvent) {
      setHelpOpen(true);
      return;
    }
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setPromptEvent(null);
    } catch {
      setPromptEvent(null);
      setHelpOpen(true);
    }
  }

  return { install, installed, helpOpen, closeHelp: () => setHelpOpen(false) };
}

export function InstallHelp({ onClose }: { onClose: () => void }) {
  const ua = navigator.userAgent;
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const secure = window.isSecureContext;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog install-help" role="dialog" aria-modal="true" aria-label="Instalar Organize">
      <header className="dialog-head"><h2>Instalar Organize</h2><button className="icon-button" onClick={onClose} aria-label="Fechar">×</button></header>
      <div className="install-help-body">
        {!secure && <p className="install-warning">Abra o Organize por HTTPS confiável no celular para habilitar a instalação. O endereço localhost do computador não funciona no telefone.</p>}
        {apple ? <><p>No iPhone ou iPad, abra este endereço no <strong>Safari</strong>:</p><ol><li>Toque em <strong>Compartilhar</strong>.</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Ative <strong>Abrir como App</strong> e toque em <strong>Adicionar</strong>.</li></ol></> : android ? <><p>No Android, abra este endereço no <strong>Chrome</strong>:</p><ol><li>Toque no menu <strong>⋮</strong>.</li><li>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme a instalação.</li></ol></> : <p>Abra o menu do navegador e escolha <strong>Instalar Organize</strong> ou <strong>Adicionar à tela inicial</strong>, se disponível.</p>}
        <p className="install-note">Os quadros e cartões continuam no servidor do Organize. Para consultá-los e editá-los, o celular precisa alcançar esse servidor.</p>
      </div>
    </section>
  </div>;
}
