import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExtensionSettings, defaultSettings, getSettings, saveSettings } from './settings';
import './index.css';

function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const toggleShop = (shop: keyof ExtensionSettings['enabledShops']) => {
    setSettings((prev) => ({
      ...prev,
      enabledShops: { ...prev.enabledShops, [shop]: !prev.enabledShops[shop] },
    }));
  };

  const toggleAutoResort = () => {
    setSettings((prev) => ({ ...prev, autoResort: !prev.autoResort }));
  };

  const onSave = async () => {
    setSaveState('saving');
    await saveSettings(settings);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1500);
  };

  return (
    <div className='min-h-screen'>
      <div className='mx-auto max-w-2xl p-6'>
        <h1 className='text-2xl font-semibold tracking-tight'>NutriData Settings</h1>

        <p className='text-sm text-muted-foreground mt-1'>
          Configure which shops NutriData runs on and behavior preferences.
        </p>

        <div className='mt-6 space-y-6'>
          <section className='bg-card text-card-foreground border rounded-lg p-5 shadow-sm'>
            <h2 className='text-lg font-medium'>Enabled shops</h2>
            <p className='text-sm text-muted-foreground mt-1'>
              Choose the shops where NutriData should analyze and display metrics.
            </p>

            <div className='mt-4 divide-y'>
              <label className='flex items-center justify-between py-3'>
                <span className='text-sm font-medium'>REWE</span>
                <input
                  type='checkbox'
                  className='h-4 w-4'
                  checked={settings.enabledShops.rewe}
                  onChange={() => toggleShop('rewe')}
                />
              </label>
              <label className='flex items-center justify-between py-3'>
                <span className='text-sm font-medium'>Amazon</span>
                <input
                  type='checkbox'
                  className='h-4 w-4'
                  checked={settings.enabledShops.amazon}
                  onChange={() => toggleShop('amazon')}
                />
              </label>
              <label className='flex items-center justify-between py-3'>
                <span className='text-sm font-medium'>Mercadona</span>
                <input
                  type='checkbox'
                  className='h-4 w-4'
                  checked={settings.enabledShops.mercadona}
                  onChange={() => toggleShop('mercadona')}
                />
              </label>
            </div>
          </section>

          <section className='bg-card text-card-foreground border rounded-lg p-5 shadow-sm'>
            <h2 className='text-lg font-medium'>Behavior</h2>
            <p className='text-sm text-muted-foreground mt-1'>
              Control automatic resorting when results update.
            </p>

            <label className='mt-4 flex items-center justify-between py-1'>
              <span className='text-sm font-medium'>Auto resort results</span>
              <input
                type='checkbox'
                className='h-4 w-4'
                checked={settings.autoResort}
                onChange={toggleAutoResort}
              />
            </label>
            <p className='text-xs text-muted-foreground mt-2'>
              When enabled, NutriData will re-apply sorting automatically as new items load.
            </p>
          </section>

          <div className='flex items-center gap-3'>
            <button
              onClick={onSave}
              disabled={saveState !== 'idle'}
              className='inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none transition-opacity ease-out duration-200'
            >
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<OptionsApp />);
}
