import { useState } from 'react';
import { Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Barangay, Municipality } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { parseBarangayCsv, type BarangayImportResult } from '@/lib/geography';

interface BarangayImportModalProps {
  open: boolean;
  municipalities: Municipality[];
  existing: Barangay[];
  onClose: () => void;
  onImported: (count: number) => void;
}

const TEMPLATE = 'municipality,barangay\nBoac,Example Barangay';

export function BarangayImportModal({ open, municipalities, existing, onClose, onImported }: BarangayImportModalProps) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<BarangayImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setText('');
    setPreview(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 512 * 1024) {
      setError('This file is too large. Use a CSV under 512 KB.');
      return;
    }
    setText(await file.text());
    setPreview(null);
    setError(null);
  };

  const handleCheck = () => {
    setError(null);
    if (!text.trim()) {
      setError('Paste or upload a CSV first.');
      return;
    }
    setPreview(parseBarangayCsv(text, municipalities, existing));
  };

  const handleImport = async () => {
    if (!preview || preview.errors.length > 0 || preview.rows.length === 0) return;
    setImporting(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('barangays')
      .insert(preview.rows)
      .select('id');
    setImporting(false);
    if (insertError) {
      setError(insertError.code === '23505'
        ? 'Some barangays were added by someone else while you were importing. Check the list and try again.'
        : 'The import could not be saved. Check your admin permissions and try again.');
      return;
    }
    onImported(data?.length ?? 0);
    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import barangays" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-brand-600">
          Upload or paste a CSV with two columns: <span className="font-mono">municipality,barangay</span>.
          Municipality names must match the six municipalities of Marinduque. Only use names from an official source.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors">
            <Upload className="h-4 w-4" />
            Choose CSV file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
          <button
            type="button"
            onClick={() => { setText(TEMPLATE); setPreview(null); }}
            className="text-sm text-brand-600 hover:text-brand-800 underline underline-offset-2"
          >
            Insert template
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          rows={8}
          aria-label="CSV content"
          placeholder={TEMPLATE}
          className="w-full rounded-lg border border-brand-200 bg-white p-3 font-mono text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />

        {preview && (
          <div className="rounded-lg border border-brand-100 bg-cream-50 p-4 text-sm space-y-2">
            <p className="text-brand-800">
              <span className="font-semibold">{preview.rows.length}</span> ready to add,{' '}
              <span className="font-semibold">{preview.duplicates}</span> already listed (skipped),{' '}
              <span className="font-semibold">{preview.errors.length}</span> with errors.
            </p>
            {preview.errors.length > 0 && (
              <ul className="list-disc pl-5 text-red-700 max-h-40 overflow-auto space-y-1">
                {preview.errors.slice(0, 50).map((err) => <li key={err}>{err}</li>)}
              </ul>
            )}
            {preview.errors.length > 0 && (
              <p className="text-xs text-brand-500">Fix these lines and check again. Nothing is imported until every line is valid.</p>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button variant="outline" onClick={handleCheck}>Check file</Button>
          <Button
            onClick={handleImport}
            loading={importing}
            disabled={!preview || preview.errors.length > 0 || preview.rows.length === 0}
          >
            Import {preview?.rows.length ?? 0} barangays
          </Button>
        </div>
      </div>
    </Modal>
  );
}
