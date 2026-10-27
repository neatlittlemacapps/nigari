import { Maximize2, X } from 'lucide-react';
import { SidePanel } from '../ui/SidePanel';
import { CenterPanel } from '../ui/CenterPanel';
import type { PeekMode } from '../peek';
import { IconButton } from '../ui/IconButton';
import { toast } from '../toast';
import { t } from '../i18n';
import Editor, { type EditorProps } from './Editor';

// A database row opened beside its view (spec 007, research R5).
//
// It is the ordinary page editor, not a reduced copy: title, properties,
// content, comments, history and live editing all come along, and a feature
// added to pages later reaches the peek without anyone remembering to (the
// "Page containers" row in .specify/memory/surfaces.md). Only the way in and
// out differs: the top bar trades the sidebar button for Close and Open as
// full page.
//
// One peek at a time. App owns which row it shows (the address carries it as
// ?peek=), so clicking another row swaps the editor inside the same panel.

type Props = Omit<EditorProps, 'pageId' | 'container' | 'peekStart' | 'peekEnd' | 'onMissing'> & {
  peekId: string;
  /** Beside the view, or over it (spec 007). */
  mode: PeekMode;
  onClose: () => void;
  onOpenFullPage: (id: string) => void;
};

export default function PeekPanel({ peekId, mode, onClose, onOpenFullPage, onTrash, ...editorProps }: Props) {
  const Panel = mode === 'center' ? CenterPanel : SidePanel;
  return (
    <Panel label={t('Page preview')} onClose={onClose} className="peek-panel">
      <Editor
        {...editorProps}
        key={peekId}
        pageId={peekId}
        container="peek"
        peekStart={<IconButton label={t('Close')} icon={<X size={18} />} onClick={onClose} />}
        peekEnd={
          <IconButton label={t('Open as full page')} icon={<Maximize2 size={16} />} onClick={() => onOpenFullPage(peekId)} />
        }
        // Deleted, moved to the trash or no longer readable while open: the
        // panel would only show an error, so it closes and says why.
        onMissing={() => {
          onClose();
          toast(t('This page is no longer available.'));
        }}
        onTrash={(id) => {
          onTrash(id);
          if (id === peekId) onClose();
        }}
      />
    </Panel>
  );
}
