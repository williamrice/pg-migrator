import { useMigration } from './useMigration'

function App(): React.JSX.Element {
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
              <input
                id="source-url"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={form.sourceUrl}
                onChange={(event) => updateForm('sourceUrl', event.target.value)}
                disabled={running}
                placeholder="postgres://user:password@source-host:5432/appdb"
              />
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
              <input
                id="destination-url"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={form.destinationAdminUrl}
                onChange={(event) => updateForm('destinationAdminUrl', event.target.value)}
                disabled={running}
                placeholder="postgres://user:password@target-host:5432/postgres"
              />
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
