import { useState, type MutableRefObject } from 'react';
import { ImageDown } from 'lucide-react';
import { t } from '../i18n';
import { toast } from '../toast';
import { Button } from '../ui/Button';
import { Popover } from '../ui/Popover';
import { Select } from '../ui/Select';
import { BACKGROUND_TOKEN, composePicture, copyPng, downloadPng, toPng, type PictureBackground, type PictureParts } from '../savePicture';

// "Save chart as" (spec 004, FR-026): a background, then Copy as PNG or
// Download PNG. Offered to everybody who sees the chart, a viewer included
// (FR-027): saving a picture changes nothing that is stored.

export default function ChartSave({ name, pictureRef }: { name: string; pictureRef: MutableRefObject<(() => PictureParts | null) | null> }) {
  const [background, setBackground] = useState<PictureBackground>('surface');

  const picture = async (): Promise<Blob | null> => {
    const parts = pictureRef.current?.();
    if (!parts) {
      toast(t('There is no chart to save yet.'));
      return null;
    }
    return toPng(composePicture(parts, parts.token(BACKGROUND_TOKEN[background])));
  };

  const copy = async () => {
    const blob = await picture();
    if (!blob) return;
    try {
      await copyPng(blob);
      toast(t('Chart copied as a picture.'));
    } catch {
      // A browser that will not put a picture on the clipboard (permission,
      // an http address, no image support) still gets the file.
      downloadPng(blob, name);
      toast(t('This browser does not allow copying a picture, so it was downloaded instead.'));
    }
  };

  const download = async () => {
    const blob = await picture();
    if (blob) downloadPng(blob, name);
  };

  return (
    <Popover
      label={t('Save chart as')}
      closeLabel={t('Close')}
      trigger={
        <Button size="sm" variant="ghost">
          <ImageDown size={14} aria-hidden="true" />
          {t('Save chart as')}
        </Button>
      }
    >
      <div className="chart-panel">
        <Select
          label={t('Background')}
          options={[
            { value: 'surface', label: t('Page') },
            { value: '1', label: t('Orange') },
            { value: '2', label: t('Blue') },
            { value: '3', label: t('Pink') },
            { value: '4', label: t('Yellow') },
          ]}
          value={background}
          onValueChange={(v) => setBackground(v as PictureBackground)}
        />
        <div className="chart-panel-row">
          <Button size="sm" onClick={() => void copy()}>
            {t('Copy as PNG')}
          </Button>
          <Button size="sm" onClick={() => void download()}>
            {t('Download PNG')}
          </Button>
        </div>
      </div>
    </Popover>
  );
}
