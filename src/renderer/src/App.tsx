import { useState } from 'react'
import { useMigration } from './useMigration'

type SecretField = 'sourceUrl' | 'destinationAdminUrl'

function EyeIcon({ open }: { open: boolean }): React.JSX.Element {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M2.1 12s3.6-6.4 9.9-6.4S21.9 12 21.9 12s-3.6 6.4-9.9 6.4S2.1 12 2.1 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m3 3 18 18" />
      <path d="M10.6 5.8A9.3 9.3 0 0 1 12 5.6c6.3 0 9.9 6.4 9.9 6.4a18.3 18.3 0 0 1-3.1 3.7" />
      <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" />
      <path d="M6.5 6.5A18.2 18.2 0 0 0 2.1 12s3.6 6.4 9.9 6.4c1.5 0 2.8-.4 4-1" />
    </svg>
  )
}

function App(): React.JSX.Element {
  const [revealedFields, setRevealedFields] = useState<Record<SecretField, boolean>>({
    sourceUrl: false,
    destinationAdminUrl: false
  })
  const {
    form,
    running,
    logs,
    status,
    phase,
    testResult,
    updateForm,
    dismissTestResult,
    start,
    cancel,
    testSource,
    testDestination
  } = useMigration()

  const toggleRevealed = (field: SecretField): void => {
    setRevealedFields((current) => ({
      ...current,
      [field]: !current[field]
    }))
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="app-title">
        <div className="masthead">
          <div>
            <p className="eyebrow">PostgreSQL copy tool</p>
            <h1 id="app-title">pg-migrator</h1>
          </div>
          <div className={`status-pill status-${phase}`} aria-live="polite">
            {status}
          </div>
        </div>

        <form
          className="migration-form"
          onSubmit={(event) => {
            event.preventDefault()
            void start()
          }}
        >
          <div className="field-group">
            <label htmlFor="source-url">Source database URL</label>
            <div className="input-row">
              <div className="password-field">
                <input
                  id="source-url"
                  type={revealedFields.sourceUrl ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={form.sourceUrl}
                  onChange={(event) => updateForm('sourceUrl', event.target.value)}
                  disabled={running}
                  placeholder="postgres://user:password@source-host:5432/appdb"
                />
                <button
                  type="button"
                  className="reveal-button"
                  aria-label={
                    revealedFields.sourceUrl ? 'Hide source database URL' : 'Reveal source database URL'
                  }
                  aria-pressed={revealedFields.sourceUrl}
                  title={
                    revealedFields.sourceUrl ? 'Hide source database URL' : 'Reveal source database URL'
                  }
                  onClick={() => toggleRevealed('sourceUrl')}
                >
                  <EyeIcon open={revealedFields.sourceUrl} />
                </button>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void testSource()}
                disabled={running}
              >
                Test
              </button>
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="destination-url">Destination admin URL</label>
            <div className="input-row">
              <div className="password-field">
                <input
                  id="destination-url"
                  type={revealedFields.destinationAdminUrl ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={form.destinationAdminUrl}
                  onChange={(event) => updateForm('destinationAdminUrl', event.target.value)}
                  disabled={running}
                  placeholder="postgres://user:password@target-host:5432/postgres"
                />
                <button
                  type="button"
                  className="reveal-button"
                  aria-label={
                    revealedFields.destinationAdminUrl
                      ? 'Hide destination admin URL'
                      : 'Reveal destination admin URL'
                  }
                  aria-pressed={revealedFields.destinationAdminUrl}
                  title={
                    revealedFields.destinationAdminUrl
                      ? 'Hide destination admin URL'
                      : 'Reveal destination admin URL'
                  }
                  onClick={() => toggleRevealed('destinationAdminUrl')}
                >
                  <EyeIcon open={revealedFields.destinationAdminUrl} />
                </button>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void testDestination()}
                disabled={running}
              >
                Test
              </button>
            </div>
          </div>

          <div className="split-fields">
            <div className="field-group">
              <label htmlFor="target-database">Target database name</label>
              <input
                id="target-database"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={form.targetDatabase}
                onChange={(event) => updateForm('targetDatabase', event.target.value)}
                disabled={running}
                placeholder="Leave blank to keep source name"
              />
            </div>

            <label className="checkbox-field" htmlFor="drop-existing">
              <input
                id="drop-existing"
                type="checkbox"
                checked={form.dropExisting}
                onChange={(event) => updateForm('dropExisting', event.target.checked)}
                disabled={running}
              />
              <span>Drop existing target database</span>
            </label>
          </div>

          {testResult && (
            <div
              className={`test-result ${testResult.ok ? 'test-ok' : 'test-error'}`}
              aria-live="polite"
            >
              <span>
                {testResult.message}
                {testResult.ok && testResult.serverVersion
                  ? ` PostgreSQL ${testResult.serverVersion}.`
                  : ''}
              </span>
              <button
                type="button"
                className="dismiss-button"
                aria-label="Dismiss test result"
                onClick={dismissTestResult}
              >
                x
              </button>
            </div>
          )}

          <div className="button-row">
            <button type="submit" className="primary-button" disabled={running}>
              Start migration
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void cancel()}
              disabled={!running}
            >
              Cancel
            </button>
          </div>
        </form>

        <div className="log-panel" aria-live="polite" aria-label="Migration log">
          <div className="log-header">
            <h2>Live log</h2>
            <span>{logs.length} lines</span>
          </div>
          <pre className="log-output" tabIndex={0}>
            {logs.length
              ? logs.join('\n')
              : 'Ready. Connection strings stay local and are never written to the log.'}
          </pre>
        </div>
      </section>
    </main>
  )
}

export default App
