import React, { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';

export function useLanguage(filename) {
  const [ext, setExt] = useState(null);
  useEffect(() => {
    let alive = true;
    const desc = LanguageDescription.matchFilename(languages, filename || '');
    if (desc) desc.load().then((l) => alive && setExt(l)).catch(() => {});
    else setExt(null);
    return () => { alive = false; };
  }, [filename]);
  return ext;
}

export default function CodeView({ value, onChange, filename, readOnly, height = '100%', onSave, wrap = false }) {
  const lang = useLanguage(filename);
  const dark = document.documentElement.dataset.theme !== 'light';
  const extensions = [lang, wrap && EditorView.lineWrapping].filter(Boolean);
  return (
    <CodeMirror
      value={value}
      height={height}
      theme={dark ? oneDark : 'light'}
      readOnly={readOnly}
      editable={!readOnly}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ foldGutter: true, highlightActiveLine: !readOnly, autocompletion: !readOnly }}
      onKeyDown={(e) => { if (onSave && e.ctrlKey && e.key === 's') { e.preventDefault(); onSave(); } }}
    />
  );
}
